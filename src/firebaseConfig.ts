import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // ALTERAÇÃO: adiciona o Firebase Authentication

const firebaseConfig = {
    apiKey: "AIzaSyAmGtx5xsFR45_XYAzqOMft-u6T6xGsbyk",
    authDomain: "tarefas-8af66.firebaseapp.com",
    projectId: "tarefas-8af66",
    storageBucket: "tarefas-8af66.firebasestorage.app",
    messagingSenderId: "99212146324",
    appId: "1:99212146324:web:b7b57c2de3cd03168ea681"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const auth = getAuth(app); // ALTERAÇÃO: cria a conexão com o Firebase Authentication