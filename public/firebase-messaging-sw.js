/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA6O-vnF8vlIxJF3Gw3AcEYw-BtrA4HEqE",
  authDomain: "loveable-wh-chat-box.firebaseapp.com",
  projectId: "loveable-wh-chat-box",
  storageBucket: "loveable-wh-chat-box.firebasestorage.app",
  messagingSenderId: "89987685679",
  appId: "1:89987685679:web:7b1de00386ecf17e8915da",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  if (title) {
    self.registration.showNotification(title, { body });
  }
});
