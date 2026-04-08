import * as Alexa from 'ask-sdk-core';
import admin from 'firebase-admin';
import axios from 'axios';
import stringSimilarity from 'string-similarity';
import { INITIAL_INGREDIENTS } from './_lib/ingredients.js';

const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.VITE_FIREBASE_SERVICE_ACCOUNT;
if (!admin.apps.length) {
    if (serviceAccountStr) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(serviceAccountStr))
            });
        } catch (e) {
            console.error("Error parsing FIREBASE_SERVICE_ACCOUNT", e);
            admin.initializeApp();
        }
    } else {
        console.warn("FIREBASE_SERVICE_ACCOUNT not set. Ensure default credentials are valid.");
        admin.initializeApp();
    }
}
const db = admin.firestore();

const LaunchRequestHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const speakOutput = 'Bienvenido a Calcula Hidratos. Dime qué alimento añadir y su cantidad en gramos.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Puedes decir: añade 50 gramos de pan.')
            .getResponse();
    }
};

const AnadirRegistroIntentHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AnadirRegistroIntent';
    },
    async handle(handlerInput: Alexa.HandlerInput) {
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

        if (!accessToken) {
            return handlerInput.responseBuilder
                .speak('Por favor, ingresa a la aplicación de Alexa y vincula tu cuenta de Google para usar esta skill.')
                .withLinkAccountCard()
                .getResponse();
        }

        let userInfo;
        try {
            const res = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            userInfo = res.data;
        } catch (error) {
            console.error('Code token expiration or invalidity', error);
            return handlerInput.responseBuilder
                .speak('El token de tu cuenta ha expirado. Por favor, vincula tu cuenta de nuevo.')
                .withLinkAccountCard()
                .getResponse();
        }

        if (!userInfo || !userInfo.email) {
            return handlerInput.responseBuilder
                .speak('No pude obtener tu correo electrónico. Revisa los permisos proporcionados.')
                .getResponse();
        }

        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(userInfo.email);
        } catch (error) {
            return handlerInput.responseBuilder
                .speak(`No tienes una cuenta de Calcula Hidratos con el correo ${userInfo.email}. Por favor ingresa a la aplicación primero.`)
                .getResponse();
        }

        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        if (!userDoc.exists) {
            return handlerInput.responseBuilder
                .speak(`Inicia sesión en la aplicación web para inicializar tu cuenta primero.`)
                .getResponse();
        }

        let docRef;
        if (userDoc.data()?.groupId) {
            docRef = db.collection('groups').doc(userDoc.data()?.groupId);
        } else {
            docRef = db.collection('users').doc(userRecord.uid);
        }

        const groupDataDoc = await docRef.get();
        if (!groupDataDoc.exists) {
            return handlerInput.responseBuilder
                .speak('No encontré tus datos de cocina en el servidor.')
                .getResponse();
        }
        const groupData = groupDataDoc.data() || {};
        const customIngredients = groupData.customIngredients || [];

        const intentRequest = handlerInput.requestEnvelope.request as any;
        const alimento = intentRequest.intent.slots?.alimento?.value;
        const cantidadStr = intentRequest.intent.slots?.cantidad?.value;

        if (!alimento || !cantidadStr) {
            return handlerInput.responseBuilder
                .speak('No entendí el alimento o la cantidad. Por favor repítelo.')
                .reprompt('Dime el ingrediente y la cantidad en gramos.')
                .getResponse();
        }

        const cantidad = parseFloat(cantidadStr);
        if (isNaN(cantidad) || cantidad <= 0) {
            return handlerInput.responseBuilder
                .speak(`La cantidad ${cantidadStr} no es válida.`)
                .getResponse();
        }

        const options = [...INITIAL_INGREDIENTS, ...customIngredients];
        const match = stringSimilarity.findBestMatch(alimento.toLowerCase(), options.map(o => o.name.toLowerCase()));

        if (match.bestMatch.rating < 0.3) {
            return handlerInput.responseBuilder
                .speak(`No encontré algo parecido a ${alimento} en tu lista de ingredientes.`)
                .getResponse();
        }

        const matchIndex = match.bestMatchIndex;
        const matchedIngredient = options[matchIndex];

        let { currentRecipeIngredients = [], currentRecipeName = '', cookingMode = false } = groupData;

        if (!cookingMode) {
            cookingMode = true;
            currentRecipeName = 'Receta de Alexa';
            currentRecipeIngredients = [];
        }

        currentRecipeIngredients.push({
            ingredientId: matchedIngredient.id,
            weight: cantidad
        });

        await docRef.update({
            cookingMode,
            currentRecipeName,
            currentRecipeIngredients,
            updatedAt: new Date().toISOString()
        });

        const speakOutput = `He añadido ${cantidad} gramos de ${matchedIngredient.name} a ${currentRecipeName}.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const speakOutput = 'Puedes decir: añade 50 gramos de pan.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const speakOutput = '¡Adiós!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const speakOutput = 'No te entendí muy bien. Recuerda usar comandos como: añade cincuenta gramos de pan al registro.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const request = handlerInput.requestEnvelope.request as any;
        console.log(`Session ended with reason: ${request.reason} - Error: ${JSON.stringify(request.error || {})}`);
        return handlerInput.responseBuilder.getResponse(); // El ended request NO debe hablar
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput: Alexa.HandlerInput, error: Error) {
        const request = handlerInput.requestEnvelope.request as any;
        const type = request.type;
        const name = type === 'IntentRequest' ? request.intent?.name : 'none';

        console.error(`Error handled: ${error.stack}`);
        console.error(`Request that failed: Type='${type}' Intent='${name}'`);

        const speakOutput = type === 'IntentRequest' && name !== 'AnadirRegistroIntent'
            ? 'Ese comando no está registrado. Me pediste algo que mi código no sabe interpretar.'
            : 'Lo siento, hubo un problema técnico en tu Alexa Skill.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Vuelve a probar, ¿qué quieres añadir?')
            .getResponse();
    }
};

const CatchAllHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const request = handlerInput.requestEnvelope.request as any;
        const type = request.type;
        const name = type === 'IntentRequest' ? request.intent?.name : 'ninguno';

        console.log(`[CATCH ALL TRIGGERED] Type='${type}' Intent='${name}'`);

        return handlerInput.responseBuilder
            .speak(`Aún no me has programado para entender el comando ${name} o la petición ${type}. Por favor revisa que el nombre del intento coincida.`)
            .getResponse();
    }
};

let skill: Alexa.Skill;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!skill) {
        skill = Alexa.SkillBuilders.custom()
            .addRequestHandlers(
                LaunchRequestHandler,
                AnadirRegistroIntentHandler,
                HelpIntentHandler,
                CancelAndStopIntentHandler,
                FallbackIntentHandler,
                SessionEndedRequestHandler,
                CatchAllHandler
            )
            .addErrorHandlers(ErrorHandler)
            .create();
    }

    try {
        const response = await skill.invoke(req.body);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error invoking skill:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
