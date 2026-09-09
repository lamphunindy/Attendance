# Supabase version archive

This directory preserves the original PostgreSQL migrations, seed and historical test helpers for reference and recovery planning. It is not used by the Firebase application or current test commands. The old helper paths and dependencies reflect their original locations and are not an executable Firebase test suite.

The current database is Cloud Firestore. See `../README.md`, `../src/lib/firebase/`, `../firestore.rules` and `../scripts/migrate-firebase.mjs`.

Moving these local files did not modify or delete the remote Supabase project.
