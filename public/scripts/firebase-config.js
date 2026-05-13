// Free cloud progress setup:
// 1. Create a Firebase project on the free Spark plan.
// 2. Enable Authentication -> Google provider.
// 3. Enable Firestore Database.
// 4. Paste the web app config below and set enabled to true.
//
// This file is safe to publish. Firebase web config identifies the project;
// security comes from Firebase Auth + Firestore rules, not from hiding this file.
window.ELITE_FIREBASE = {
  enabled: true,
  config: {
    apiKey: "AIzaSyCY7NTJmsYyOvW-85A3fXIS2d8s2Yfll28",
    authDomain: "elite-igcse-progress.firebaseapp.com",
    projectId: "elite-igcse-progress",
    storageBucket: "elite-igcse-progress.firebasestorage.app",
    messagingSenderId: "223142094309",
    appId: "1:223142094309:web:51af9f8d7bd848b3e5bb0c",
    measurementId: "G-G0T2J5BKXW"
  }
};
