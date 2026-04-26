# 🎵 Spotify Playlist Generator

Une application web React permettant d'interagir avec vos playlists Spotify pour générer de nouvelles listes de lecture personnalisées en utilisant l'API Web Spotify.

## ✨ Fonctionnalités

- 🔐 **Authentification Spotify** : Connexion sécurisée via OAuth 2.0 avec votre compte Spotify.
- 🎲 **Générateur Aléatoire (Random Generator)** : Parcourez vos playlists et générez une sélection aléatoire de titres avec des critères spécifiques.
- 🔀 **Générateur Mixte (Mixed Generator)** : Fusionnez et mélangez plusieurs de vos playlists existantes pour en créer de nouvelles.
- 📱 **Interface Responsive** : Design moderne et réactif qui s'adapte à tous les écrans.

## 🛠️ Technologies Utilisées

- **Frontend** : React 18, React Router v6
- **Build Tool** : Vite
- **Styling** : CSS (Vanilla)
- **API** : Spotify Web API

## 📋 Prérequis

Avant de commencer, vous aurez besoin de :
1. [Node.js](https://nodejs.org/) installé sur votre machine.
2. Un compte développeur Spotify (pour obtenir un `Client ID`).
   - Allez sur [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
   - Créez une nouvelle application.
   - Récupérez votre **Client ID**.
   - Dans les paramètres de l'application Spotify, ajoutez `http://localhost:5173` aux **Redirect URIs**.

## 🚀 Installation

1. Clonez le dépôt (ou téléchargez les fichiers) :
```bash
git clone https://github.com/Theo1187971/spotify-playlist.git
cd spotify-playlist
```

2. Installez les dépendances :
```bash
npm install
```

3. Configurez les variables d'environnement. Créez un fichier `.env.local` à la racine du projet et ajoutez-y les informations suivantes :
```env
VITE_SPOTIFY_CLIENT_ID=votre_client_id_spotify
VITE_REDIRECT_URI=http://localhost:5173
```
*(Ajustez selon la façon dont est configurée l'authentification dans votre fichier `src/config.js` ou similaire).*

4. Lancez le serveur de développement :
```bash
npm run dev
```

L'application sera accessible sur `http://localhost:5173`.

## 📁 Structure du Projet

```text
src/
├── components/    # Composants réutilisables (Navbar, etc.)
├── context/       # Contexte React (AuthContext pour la gestion de connexion)
├── pages/         # Pages de l'application (Login, RandomGenerator, MixedGenerator)
├── services/      # Appels API (spotify.js, auth.js)
├── main.jsx       # Point d'entrée React
└── index.css      # Styles globaux
```

## 🤝 Contribuer

Les contributions, issues et demandes de fonctionnalités sont les bienvenues. N'hésitez pas à vérifier la page des [issues](https://github.com/Theo1187971/spotify-playlist/issues) si vous souhaitez participer au projet.

## 📝 Licence

Ce projet est créé à des fins personnelles et éducatives.
