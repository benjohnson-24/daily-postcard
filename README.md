# Daily Postcard

A tiny private site for two people at two different colleges.

Each phone signs itself in as Ben or Kinsley the first time it's opened, and
stays that way — your name shows in the header with a **Switch** button.

Every day you both get **the same question**. You each answer it privately,
optionally attaching a photo. Neither of you sees the other's answer until
you've **both** submitted — then the two answers appear together on a postcard,
photos and all. Completed days pile up in the **Postcards** tab.

It's plain HTML/CSS/JS with no backend of its own. Answers live in a free
[Supabase](https://supabase.com) database, which the page talks to directly
from the browser. That's what lets it run on free static hosting like GitHub
Pages.

```
index.html     the page
styles.css     all the styling
app.js         the logic (you shouldn't need to touch this)
hearts.js      the drifting background hearts + click bursts
typing.js      the letter-pop effect while you type
questions.js   >>> the question bank — edit freely
config.js      >>> names + Supabase credentials — EDIT ME
schema.sql     run this once in Supabase to create the table
```

The hearts have a `TUNING` block at the top of `hearts.js` — count, sizes,
fade range, drift speed, how hard they dodge the cursor, and how big the click
burst is. All plain numbers, safe to fiddle with.

---

## One-time setup

### 1. Create the Supabase table

In your Supabase project: **SQL Editor → New query**, paste the whole of
[`schema.sql`](schema.sql), and hit **Run**. It creates an `entries` table with:

| column     | what it holds                          |
|------------|----------------------------------------|
| `date`     | the day, e.g. `2026-08-17`             |
| `name`     | who wrote it                           |
| `answer`   | what they wrote                        |
| `question` | the question as it was asked that day  |
| `photo`    | link to the attached picture, if any   |
| `at`       | when the entry was sealed              |

It also creates a storage bucket called `photos` for the attached pictures.

`date + name` is unique, so re-submitting **updates** your answer instead of
creating a duplicate.

### 2. Fill in `config.js`

```js
window.CONFIG = {
  names: ["Ben", "Kinsley"],
  supabaseUrl: "https://xxxxxxxxxxxx.supabase.co",
  supabaseKey: "sb_publishable_...",
  timezone: "America/New_York"
};
```

Both values come from **Project Settings → API** in the Supabase dashboard.

Use the **publishable** key (`sb_publishable_...`). Older Supabase projects call
the same thing the **anon public** key. Never use the **secret** key
(`sb_secret_...`, formerly `service_role`) — it bypasses every security rule on
your database.

If the app opens and says "Almost there", it's telling you exactly which of
these is still a placeholder.

---

## Reactions and replies

Once a postcard is revealed, each person's answer carries a **Respond** button.
Open it to:

- **React** with an emoji from the row at the top. Tap to add, tap again to take
  it off. Reactions show as chips right under the answer.
- **Reply** with text. Replies stack under the answer oldest-first, and your own
  are tinted differently from theirs.

The button shows a count of replies — **Respond 1**, **Respond 2**, and so on —
so you can see there's something waiting without opening it. There's no
push notification for a new reaction or reply; you'll see it next time either
of you opens the site, since it refetches automatically (see below).

The emoji row is yours to edit, in `config.js`:

```js
reactions: ["❤️", "😂", "🥹", "🔥", "😭", "👀", "🫶", "😮"],
```

Reactions work without a delete policy: your whole emoji set for a given answer
is stored as one string and rewritten each time you tap, so nothing is ever
deleted. Replies are append-only — there's no way to take one back from the
site.

## Staying current

Coming back to the tab, or unlocking your phone with the site open, quietly
refetches everything — a new answer, reaction, or reply shows up without you
reloading. Anything you were part-way through typing is preserved across that
refresh, so it can't eat a draft.

## Long answers

Answers up to a few sentences (roughly 300 characters) always show in full.
Past that, the card shows a preview and a **Show more** link that opens the
whole thing in a popup — so one long answer can't stretch the card
indefinitely or crowd out everything below it. The cutoff is
`ANSWER_TRUNCATE_AT` near the top of `app.js` if you want it longer or
shorter.

## Times on postcards

Each entry records when it was sealed. With a photo, the time is handwritten
on the polaroid's white strip; without one it sits under the handwriting in
small caps.

Times display in the `timezone` from `config.js` (currently `America/Chicago`,
Central), not each person's local clock — so a time on a postcard means the
same thing to both of you.

Note this is **when the entry was posted**, not when the photo was originally
taken. Cameras store that in EXIF data, which gets stripped when the picture
is shrunk for upload. For a photo you shoot in the app they're the same
moment; for one pulled from your camera roll it's the time you posted it.

---

## Removing an answer

Both the waiting screen and the revealed postcard carry a **Remove my answer**
link, behind a confirm step. Removing puts that day back to unanswered for you:
the postcard un-reveals, the other person goes back to "waiting on you", and
their own answer is untouched.

Under the hood it doesn't delete the row — it blanks the `answer` field, and
the app reads a blank answer as "hasn't answered yet". That means **the site
still has no way to delete anything**, so a stray tap (or anyone who finds the
URL) can't destroy your archive. If you ever remove something by accident, the
original text is still sitting in the `entries` table in the Supabase dashboard
until you overwrite it with a new answer.

Only today is removable. Past postcards can't be taken down from the site.

---

## Accounts

The circle in the top right shows which account this device is on — **B** for
Ben, **K** for Kinsley. Tap it to see who you're signed in as and to switch.

There's no password — picking a name just tells this browser who you are, and
it's remembered in `localStorage`. Consequences worth knowing:

- Clearing your browser data, or using a private/incognito window, forgets it
  and you'll get the chooser again.
- Each device is separate. Your phone and your laptop each pick once.
- It's a convenience, not security. Anyone with the link can still pick either
  name — see the privacy note at the bottom.

## Photos

Attaching one is optional, and there are two buttons:

- **Take a photo** opens the camera. On a phone that's the real camera app.
  On a Mac or PC the page opens your webcam inline with a live preview and a
  **Capture** button — the shot attaches itself straight away.
- **Choose from camera roll** opens your photo library.

The in-page webcam needs a secure connection, which means `https://` or
`localhost`. GitHub Pages is https, so it works once deployed. If the camera
is blocked or unavailable, you get a plain message and the file picker still
works.

There's no way for a web page to launch Photo Booth or any other native app —
browsers don't permit it, and there'd be no route back into the page for the
resulting picture. The in-page webcam is the equivalent.

Before anything is uploaded, the picture is shrunk to 1400px on its longest
edge and re-encoded as a JPEG — a 4MB phone photo lands around 150KB, which
keeps you inside the free tier for years. The EXIF rotation an iPhone writes is
honoured, so sideways photos come out the right way up.

Once one is attached you get **Retake**, **Camera roll**, and **Remove photo**.

To change the quality, edit these two lines near the top of `app.js`:

```js
var PHOTO_MAX     = 1400;   // longest edge we keep, px
var PHOTO_QUALITY = 0.72;   // jpeg quality
```

Re-submitting replaces your photo for that day rather than piling up copies.

**One caveat:** the `photos` bucket is public, meaning the image links work for
anyone who has them. That's the same trade you already made by having no login
— see the privacy note at the bottom.

---

## Editing the questions

Open [`questions.js`](questions.js) and edit the list. Each question is one
string, comma-separated:

```js
window.QUESTIONS = [
  "What made you laugh today?",
  "What are you avoiding right now?",
];
```

There are **71** to start, in shuffled order. Add as many as you like.

They're built on three principles:

- **Open-ended only.** Nothing answerable with yes or no — closeness comes
  from ongoing discovery, not from confirming what you already assume.
- **Symmetric.** You both answer the same question, so none of them lean on
  one person or put anyone on the spot alone.
- **Weighted toward ordinary detail.** Research on long-distance couples finds
  they idealize each other, and heavy idealization predicts a rough landing
  when you're finally in the same place. So a lot of these ask about the
  unglamorous texture of your actual days — what you ate, what's annoying you,
  what you're avoiding — not just romantic reflection.

**Nothing is random day to day.** The list itself is shuffled, but which
question lands on a given date comes from arithmetic on that date — so both of
you always see the same one, and reloading never changes it. It steps through
the list by a stride picked to share no factor with the list length, which
means **every question is used exactly once before any of them comes back**.
With 71 questions that's a 71-day cycle; add one more and it becomes 72.

Editing the list reshuffles which question lands on which future day. **Old
postcards aren't affected** — each answer stores the question it was written
under, right there in the database.

---

## Changing your Supabase credentials

Edit the two strings in `config.js`, save, commit, push. That's it. If you ever
move to a different Supabase project, re-run `schema.sql` there first.

---

## Running it on your own computer

Because the browser blocks some things on `file://`, don't just double-click
`index.html`. From this folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Stop it with `Ctrl+C`.

---

## Deploying to GitHub Pages

Once, from this folder:

```bash
git init && git add . && git commit -m "Daily Postcard"
```

Create an empty repo on GitHub (no README, no .gitignore), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main && git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch →
`main` / `/ (root)` → Save.** A minute later the site is live at
`https://YOUR-USERNAME.github.io/YOUR-REPO/`.

### Making it feel like an app on your phone

Open the live site in Safari, tap **Share → Add to Home Screen**. You get the
heart icon on your home screen, and it opens full-screen with no browser bars.
Since each phone stays signed in, it goes straight to today's question.

**One thing to do after your first deploy:** open `index.html` and change

```html
<meta property="og:image" content="preview.png">
```

to the full address, e.g.

```html
<meta property="og:image" content="https://YOUR-USERNAME.github.io/YOUR-REPO/preview.png">
```

Some apps — iMessage among them — want an absolute URL before they'll show the
preview image when you send the link.

To update it later:

```bash
git add . && git commit -m "new questions" && git push
```

---

## What you should know about privacy

There is **no login**. Anyone who has the URL can read both of your answers and
can submit as either of you. That was a deliberate trade for simplicity.

On top of that, GitHub Pages on a free account only works from a **public**
repo, so the URL and the source are technically discoverable by anyone.

- The Supabase **publishable key being public is fine and expected** — that's
  what it's for. Your data is protected by the Row Level Security policies in
  `schema.sql`, not by hiding the key.
- Those policies allow read, insert, and update — but **not delete**. Nothing
  going through the website can erase your history.
- Attached photos live in a **public** storage bucket. Anyone with an image's
  URL can view it, and those URLs are visible to anyone who can load the site.
- The account chooser is **not a login**. It remembers who you are for
  convenience; it doesn't stop anyone from picking either name.
- If this ever stops feeling okay, the fix is a shared passcode gate or moving
  to Supabase Auth. Both are small changes.

Don't put anything here you'd be upset to see on a public URL.
