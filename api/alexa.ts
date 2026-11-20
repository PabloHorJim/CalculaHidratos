import * as Alexa from 'ask-sdk-core';
import stringSimilarity from 'string-similarity';
import { INITIAL_INGREDIENTS } from './_lib/ingredients.js';
import { IngredientLike, withExtras, ingredientCarbs, recipeMacros } from './_lib/nutrition.js';
import { verifyAlexaRequest } from './_lib/alexaVerify.js';
import { ApiRequest, readBody, sendJson } from './_lib/http.js';
import { admin, firestore } from './_lib/admin.js';
import { isGroupMember } from './_lib/membership.js';
import type { ServerResponse } from 'node:http';

const db = firestore();

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
        const kitchen = await resolveKitchen(handlerInput);
        if ('response' in kitchen) return kitchen.response;
        const { docRef, options } = kitchen;

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
                .speak(`La cantidad ${cantidadStr} no es válida. Dime el ingrediente y la cantidad en gramos.`)
                .reprompt('Dime el ingrediente y la cantidad en gramos.')
                .getResponse();
        }

        const matchedIngredient = findIngredient(options, alimento);
        if (!matchedIngredient) {
            return handlerInput.responseBuilder
                .speak(`No encontré algo parecido a ${alimento} en tu lista de ingredientes. Prueba con otro nombre.`)
                .reprompt('Dime el ingrediente y la cantidad en gramos.')
                .getResponse();
        }


        // Each ingredient appears once in a recipe: saying it again adds to its weight.
        // Done in a transaction so two quick requests (or the app) cannot overwrite each other.
        const totalWeight = await db.runTransaction(async tx => {
            const fresh = (await tx.get(docRef)).data() || {};
            let ingredients: { ingredientId: string; weight: number }[] =
                Array.isArray(fresh.currentRecipeIngredients) ? [...fresh.currentRecipeIngredients] : [];
            let name: string = fresh.currentRecipeName || '';
            if (!fresh.cookingMode) {
                ingredients = [];
                name = 'Receta de Alexa';
            }
            const index = ingredients.findIndex(ri => ri.ingredientId === matchedIngredient.id);
            const weight = (index >= 0 ? Number(ingredients[index].weight) || 0 : 0) + cantidad;
            if (index >= 0) ingredients[index] = { ...ingredients[index], weight };
            else ingredients.push({ ingredientId: matchedIngredient.id, weight });
            tx.update(docRef, {
                cookingMode: true,
                currentRecipeName: name,
                currentRecipeIngredients: ingredients,
                updatedAt: new Date().toISOString()
            });
            return weight;
        });

        const speakOutput = totalWeight !== cantidad
            ? `He añadido ${cantidad} gramos de ${matchedIngredient.name}, en total ${totalWeight} gramos. ¿Deseas añadir algo más?`
            : `He añadido ${cantidad} gramos de ${matchedIngredient.name}. ¿Deseas añadir algo más?`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Dime el siguiente ingrediente o cantidad, o di basta para terminar de editar la receta.')
            .getResponse();
    }
};


type Kitchen = {
    docRef: FirebaseFirestore.DocumentReference;
    data: FirebaseFirestore.DocumentData;
    /** Built-in and family ingredients, with their piece weights and cooking factors. */
    options: IngredientLike[];
};

const isIntent = (handlerInput: Alexa.HandlerInput, name: string) =>
    Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(handlerInput.requestEnvelope) === name;

const slot = (handlerInput: Alexa.HandlerInput, name: string): string | undefined =>
    (handlerInput.requestEnvelope.request as any).intent?.slots?.[name]?.value;

/** Spanish number for speech: "12,5", "40". */
const say = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function findIngredient(options: IngredientLike[], spoken: string): IngredientLike | null {
    if (options.length === 0) return null;
    const match = stringSimilarity.findBestMatch(spoken.toLowerCase(), options.map(o => o.name.toLowerCase()));
    return match.bestMatch.rating < 0.3 ? null : options[match.bestMatchIndex];
}

/** Finds the shared document (family group or personal) of the linked Google account. */
async function resolveKitchen(handlerInput: Alexa.HandlerInput): Promise<Kitchen | { response: ReturnType<Alexa.ResponseBuilder['getResponse']> }> {
    const fail = (text: string, linkCard = false) => {
        const builder = handlerInput.responseBuilder.speak(text);
        if (linkCard) builder.withLinkAccountCard();
        return { response: builder.getResponse() };
    };
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    if (!accessToken) return fail('Por favor, ingresa a la aplicación de Alexa y vincula tu cuenta de Google para usar esta skill.', true);

    let email: string | undefined;
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) throw new Error(`userinfo ${res.status}`);
        email = (await res.json() as { email?: string }).email;
    } catch (error) {
        console.error('Account token expired or invalid', error);
        return fail('El token de tu cuenta ha expirado. Por favor, vincula tu cuenta de nuevo.', true);
    }
    if (!email) return fail('No pude obtener tu correo electrónico. Revisa los permisos proporcionados.');

    let uid: string;
    try {
        uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch {
        return fail('No tienes una cuenta de Calcula Hidratos con ese correo. Por favor ingresa a la aplicación primero.');
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return fail('Inicia sesión en la aplicación web para inicializar tu cuenta primero.');

    // The profile's groupId is written by the user, so it does not prove membership: this code
    // runs with admin rights and must apply the same test as firestore.rules (member list,
    // or a group made by an old version that has no member list yet).
    const groupId = userDoc.data()?.groupId;
    const docRef = typeof groupId === 'string' && groupId && !groupId.includes('/')
        ? db.collection('groups').doc(groupId) : db.collection('users').doc(uid);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return fail('No encontré tus datos de cocina en el servidor.');
    const data = snapshot.data() || {};
    if (docRef.parent.id === 'groups' && !isGroupMember(data, uid)) {
        return fail('No perteneces a ese grupo familiar. Únete desde la aplicación con una invitación.');
    }
    const custom: IngredientLike[] = Array.isArray(data.customIngredients) ? data.customIngredients : [];
    const extras = data.ingredientExtras && typeof data.ingredientExtras === 'object' ? data.ingredientExtras : {};
    const options = [...(INITIAL_INGREDIENTS as IngredientLike[]), ...custom].map(i => withExtras(i, extras));
    return { docRef, data, options };
}

type RecipeItem = { ingredientId: string; weight: number; cooked?: boolean };

/** Changes the recipe being cooked inside a transaction, so the app and Alexa never overwrite each other. */
async function editCurrentRecipe<T>(docRef: FirebaseFirestore.DocumentReference, edit: (items: RecipeItem[]) => { items: RecipeItem[]; result: T }): Promise<T> {
    return db.runTransaction(async tx => {
        const fresh = (await tx.get(docRef)).data() || {};
        const cooking = !!fresh.cookingMode;
        const current: RecipeItem[] = cooking && Array.isArray(fresh.currentRecipeIngredients) ? [...fresh.currentRecipeIngredients] : [];
        const { items, result } = edit(current);
        tx.update(docRef, {
            cookingMode: true,
            currentRecipeName: cooking ? (fresh.currentRecipeName || '') : 'Receta de Alexa',
            currentRecipeIngredients: items,
            updatedAt: new Date().toISOString()
        });
        return result;
    });
}

/** "Añade dos plátanos": pieces instead of grams, for ingredients with a known piece weight. */
const AnadirUnidadesIntentHandler = {
    canHandle: (handlerInput: Alexa.HandlerInput) => isIntent(handlerInput, 'AnadirUnidadesIntent'),
    async handle(handlerInput: Alexa.HandlerInput) {
        const kitchen = await resolveKitchen(handlerInput);
        if ('response' in kitchen) return kitchen.response;
        const alimento = slot(handlerInput, 'alimento');
        const unidades = parseFloat(slot(handlerInput, 'unidades') ?? '');
        const again = 'Dime el ingrediente y la cantidad.';
        if (!alimento || !Number.isFinite(unidades) || unidades <= 0 || unidades > 100) {
            return handlerInput.responseBuilder.speak('No entendí el alimento o cuántas unidades. Por favor repítelo.').reprompt(again).getResponse();
        }
        const ingredient = findIngredient(kitchen.options, alimento);
        if (!ingredient) {
            return handlerInput.responseBuilder.speak(`No encontré algo parecido a ${alimento}. Prueba con otro nombre.`).reprompt(again).getResponse();
        }
        if (!ingredient.unitWeight) {
            return handlerInput.responseBuilder
                .speak(`No sé cuánto pesa una unidad de ${ingredient.name}. Dime la cantidad en gramos, o pon el peso por unidad en la aplicación.`)
                .reprompt(again).getResponse();
        }
        const grams = Math.round(unidades * ingredient.unitWeight);
        const total = await editCurrentRecipe(kitchen.docRef, items => {
            const index = items.findIndex(ri => ri.ingredientId === ingredient.id);
            const weight = (index >= 0 ? Number(items[index].weight) || 0 : 0) + grams;
            if (index >= 0) items[index] = { ...items[index], weight };
            else items.push({ ingredientId: ingredient.id, weight });
            return { items, result: weight };
        });
        const carbs = ingredientCarbs(ingredient, { weight: grams });
        return handlerInput.responseBuilder
            .speak(`He añadido ${say(unidades)} de ${ingredient.name}, unos ${grams} gramos y ${say(carbs)} de hidratos${total !== grams ? `, en total ${total} gramos` : ''}. ¿Algo más?`)
            .reprompt('Dime el siguiente ingrediente, o di basta para terminar.')
            .getResponse();
    }
};

/** "Quita el arroz" */
const QuitarIngredienteIntentHandler = {
    canHandle: (handlerInput: Alexa.HandlerInput) => isIntent(handlerInput, 'QuitarIngredienteIntent'),
    async handle(handlerInput: Alexa.HandlerInput) {
        const kitchen = await resolveKitchen(handlerInput);
        if ('response' in kitchen) return kitchen.response;
        const alimento = slot(handlerInput, 'alimento');
        const inRecipe: RecipeItem[] = kitchen.data.cookingMode && Array.isArray(kitchen.data.currentRecipeIngredients) ? kitchen.data.currentRecipeIngredients : [];
        // Only look among what is in the recipe: "quita el pan" must not match another bread
        const candidates = kitchen.options.filter(o => inRecipe.some(ri => ri.ingredientId === o.id));
        const ingredient = alimento ? findIngredient(candidates, alimento) : null;
        if (!ingredient) {
            return handlerInput.responseBuilder.speak(`No encontré ${alimento ?? 'ese ingrediente'} en la receta actual.`).reprompt('¿Qué más necesitas?').getResponse();
        }
        await editCurrentRecipe(kitchen.docRef, items => ({ items: items.filter(ri => ri.ingredientId !== ingredient.id), result: null }));
        return handlerInput.responseBuilder.speak(`He quitado ${ingredient.name} de la receta. ¿Algo más?`).reprompt('¿Qué más necesitas?').getResponse();
    }
};

/** "¿Cuántos hidratos lleva?" */
const ConsultarHidratosIntentHandler = {
    canHandle: (handlerInput: Alexa.HandlerInput) => isIntent(handlerInput, 'ConsultarHidratosIntent'),
    async handle(handlerInput: Alexa.HandlerInput) {
        const kitchen = await resolveKitchen(handlerInput);
        if ('response' in kitchen) return kitchen.response;
        const { data, options } = kitchen;
        const items: RecipeItem[] = data.cookingMode && Array.isArray(data.currentRecipeIngredients) ? data.currentRecipeIngredients : [];
        if (items.length === 0) {
            return handlerInput.responseBuilder.speak('Ahora mismo no hay ninguna receta en preparación. Dime un ingrediente y su cantidad para empezar.')
                .reprompt('Puedes decir: añade 50 gramos de pan.').getResponse();
        }
        const byId = new Map(options.map(o => [o.id, o]));
        const totals = recipeMacros(items, id => byId.get(id));
        const unknown = items.filter(ri => !byId.has(ri.ingredientId)).length;
        let speech = `La receta ${data.currentRecipeName ? data.currentRecipeName + ' ' : ''}lleva ${items.length} ingrediente${items.length === 1 ? '' : 's'} y ${say(totals.carbs)} gramos de hidratos en total.`;
        if (unknown > 0) speech += ` Ojo: ${unknown} ingrediente${unknown === 1 ? ' ya no existe y no se cuenta' : 's ya no existen y no se cuentan'}.`;

        // Share of each diabetic member if the whole dish is shared out with the usual proportions
        const family: { name?: string; proportion?: number; isDiabetic?: boolean; isActive?: boolean }[] = Array.isArray(data.family) ? data.family : [];
        const active = family.filter(m => m.isActive);
        const sum = active.reduce((acc, m) => acc + (Number(m.proportion) || 0), 0);
        if (sum > 0) {
            for (const member of active.filter(m => m.isDiabetic && m.name)) {
                speech += ` A ${member.name} le corresponden ${say(totals.carbs * (Number(member.proportion) || 0) / sum)}.`;
            }
        }
        return handlerInput.responseBuilder.speak(speech + ' ¿Algo más?').reprompt('¿Qué más necesitas?').getResponse();
    }
};

/** "Empieza una receta nueva" */
const NuevaRecetaIntentHandler = {
    canHandle: (handlerInput: Alexa.HandlerInput) => isIntent(handlerInput, 'NuevaRecetaIntent'),
    async handle(handlerInput: Alexa.HandlerInput) {
        const kitchen = await resolveKitchen(handlerInput);
        if ('response' in kitchen) return kitchen.response;
        await kitchen.docRef.update({ cookingMode: true, currentRecipeName: 'Receta de Alexa', currentRecipeIngredients: [], updatedAt: new Date().toISOString() });
        return handlerInput.responseBuilder.speak('Receta nueva empezada. Dime el primer ingrediente y su cantidad.')
            .reprompt('Puedes decir: añade 200 gramos de arroz.').getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput: Alexa.HandlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput: Alexa.HandlerInput) {
        const speakOutput = 'Puedes decir: añade 50 gramos de pan; añade dos plátanos; quita el arroz; cuántos hidratos lleva; o empieza una receta nueva.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Qué quieres hacer?')
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

/**
 * ALEXA_SIGNATURE_MODE: "enforce" (default) rejects requests that are not signed by Alexa;
 * "log" only logs the failure (temporary escape hatch while configuring the deployment).
 * ALEXA_SKILL_ID (optional): only requests addressed to this skill are accepted.
 */
export default async function handler(req: ApiRequest, res: ServerResponse) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

    const { text, exact } = await readBody(req);
    try {
        await verifyAlexaRequest({ rawBody: text, headers: req.headers, skillId: process.env.ALEXA_SKILL_ID || undefined });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`Alexa request verification failed: ${reason}` +
            (exact ? '' : ' (the body had already been parsed by the platform; set NODEJS_HELPERS=0 so it can be checked byte for byte)'));
        if (process.env.ALEXA_SIGNATURE_MODE !== 'log') return sendJson(res, 400, { error: 'Invalid Alexa request' });
    }

    let envelope: any;
    try {
        envelope = JSON.parse(text);
    } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' });
    }

    if (!skill) {
        skill = Alexa.SkillBuilders.custom()
            .addRequestHandlers(
                LaunchRequestHandler,
                AnadirRegistroIntentHandler,
                AnadirUnidadesIntentHandler,
                QuitarIngredienteIntentHandler,
                ConsultarHidratosIntentHandler,
                NuevaRecetaIntentHandler,
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
        sendJson(res, 200, await skill.invoke(envelope));
    } catch (error) {
        console.error('Error invoking skill:', error);
        sendJson(res, 500, { error: 'Internal Server Error' });
    }
}
