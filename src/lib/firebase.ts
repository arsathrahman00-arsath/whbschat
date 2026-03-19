import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyA6O-vnF8vlIxJF3Gw3AcEYw-BtrA4HEqE",
  authDomain: "loveable-wh-chat-box.firebaseapp.com",
  projectId: "loveable-wh-chat-box",
  storageBucket: "loveable-wh-chat-box.firebasestorage.app",
  messagingSenderId: "89987685679",
  appId: "1:89987685679:web:7b1de00386ecf17e8915da",
  measurementId: "G-4DMPER661D",
};

const VAPID_KEY =
  "BFtZ5qphlI4doDtLUN-uZ9HA7qa670ioxQEZFWnkxpDFfd2LL4mvFjdhDkZGWYG8NdTsi7RVyIODK1cmZrokBQU";

const app = initializeApp(firebaseConfig);

export async function getDeviceToken(): Promise<string> {
  try {
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission denied");
    }
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token;
  } catch (error) {
    console.error("Failed to get device token:", error);
    return "";
  }
}
