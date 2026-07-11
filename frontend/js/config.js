/**
 * NEXA Global Configuration
 * 
 * When hosting frontend and backend on DIFFERENT servers:
 * 1. Set API_BASE_URL to your backend domain (e.g., 'https://examnexa.onrender.com')
 * 2. Ensure CORS is enabled on the backend.
 * 
 * For LOCAL / SAME-DOMAIN hosting:
 * Set API_BASE_URL to an empty string ''.
 */
const CONFIG = {
  API_BASE_URL: 'https://examnexa.onrender.com', 

  // Firebase Configuration for Google Sign-In
  // To enable real Google Auth: uncomment and fill in your Firebase project keys.
  // If left as null/commented, the application automatically uses the beautiful built-in Google Auth simulator.
  FIREBASE: null
  /*
  FIREBASE: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  }
  */
};
