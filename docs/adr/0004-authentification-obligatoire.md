# Authentification obligatoire sur toute l'application

**Contexte.** Le tableau de bord est conçu pour être projeté en réunion et
consulté largement (équipes district, coordination nationale, DAP). La
coordination édite en plus la grille de paramètres et déclenche les imports —
des actions qui exigent un contrôle d'accès.

**Décision.** L'accès est authentifié **partout**, y compris la consultation.
Trois rôles : `lecteur` (consultation seule), `coordination` (consultation +
imports + édition de la grille de paramètres), `admin` (gestion des comptes et
des rôles, sans accès aux données). Les comptes sont créés par un `admin` ; pas
d'auto-inscription.

**Considéré et écarté.** Un tableau de bord de consultation ouvert sur le réseau
NPSP, avec une zone d'admin protégée uniquement. Rejeté : les scores DQA sont
des données de performance par site, leur circulation doit être tracée ; et un
modèle à accès unique est plus simple à exploiter qu'un modèle hybride
public/privé.

**Conséquence.** Le socle applicatif porte dès la première livraison la gestion
des utilisateurs, des sessions et des rôles, même si la première tranche
fonctionnelle ne calcule que P5 et P6.
