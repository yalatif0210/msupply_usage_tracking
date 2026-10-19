# 04: Programmes éligibles administrés

**What to build:** la coordination active ou désactive, dans l'application,
les programmes évalués pour chaque site. Un import ultérieur ne revient
jamais sur ses choix (ADR 0020).

**Blocked by:** 03

**Status:** done

- [x] Schéma : origine du statut du couple site x programme (fichier ou
  application) ; la promotion ne modifie pas un couple modifié dans
  l'application ; un couple nouveau prend le statut du fichier.
- [x] API : lecture (tout rôle) et modification (coordination), sur le modèle
  de `/admin/strates`.
- [x] Écran d'administration : par site, liste des programmes avec leur
  activité récente (inventaires, réquisitions) pour aider la décision.
- [x] Rafraîchissement des scores après modification.
- [x] Tests : import qui n'écrase pas un choix de l'application ; couple
  nouveau ajouté.
