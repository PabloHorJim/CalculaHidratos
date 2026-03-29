# CalculaHidratos
A simple web based application to help in the carbohydrates management of people with diabetes. It allows you to measure the carbohydrates of each meal, and help in the split of the meals among a family. 

## Deployment

### Firebase Setup
1. Create a Firebase project.
2. Enable **Google Authentication**.
3. Create a **Firestore** database and apply the `firestore.rules`.
4. Get your Firebase configuration keys.

### Vercel / GitHub Deployment
1. Push the code to a GitHub repository.
2. Connect the repository to Vercel.
3. Configure the following **Environment Variables** in Vercel (based on `.env.example`):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (optional, defaults to `(default)`)
4. Set the build command to `npm run build` and output directory to `dist`.

## Local Development
1. Copy `.env.example` to `.env`.
2. Fill in your Firebase configuration.
3. Run `npm install && npm run dev`.
