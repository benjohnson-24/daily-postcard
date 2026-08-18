/* ============================================================
   EDIT ME  —  everything you'll ever need to change is here.
   ============================================================ */

window.CONFIG = {

  // ---- 1. YOUR TWO NAMES ----------------------------------
  // These appear in the dropdown and on the postcard.
  // NOTE: these are Claude's GUESS — confirm/fix the spelling.
  // If you change a name AFTER you've saved answers, old
  // entries keep the old name and won't pair up anymore.
  names: ["Ben", "Kinsley"],

  // ---- 2. SUPABASE CREDENTIALS ----------------------------
  // Supabase dashboard -> Project Settings -> API
  //
  // Use the PUBLISHABLE key (starts "sb_publishable_").
  // Older projects call the same thing the "anon public" key.
  // It is designed to be public — safe to commit.
  //
  // NEVER put the SECRET key (starts "sb_secret_") in here.
  // That one bypasses every security rule on your database.
  supabaseUrl: "https://vzuhqlgcrcfsaxhvmieq.supabase.co",
  supabaseKey: "sb_publishable_LMto8YS6gDXh4rvKBCOBuA_mVzurzKJ",

  // ---- 3. REACTION EMOJI ----------------------------------
  // The row of emoji you can tap onto each other's answers.
  // Swap in whatever you two actually use.
  reactions: ["❤️", "😂", "🥹", "🔥",
              "😭", "👀", "🫶", "😮"],

  // ---- 4. WHAT COUNTS AS "TODAY" --------------------------
  // Both of you get the same question at the same moment,
  // no matter which timezone each campus is in.
  // Full list: en.wikipedia.org/wiki/List_of_tz_database_time_zones
  timezone: "America/Chicago"
};
