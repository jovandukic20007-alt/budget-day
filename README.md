# My Day

A personal web app for your phone and computer with three parts:

- **Expenses.** Log what you spend each day. You get a short daily summary, a day-by-day list, a breakdown by category, and a monthly bar with your target (800 €) and hard limit (1,000 €). The bar turns orange above the target and red above the limit.
- **Goals.** Add a goal (e.g. "Learn Claude Code"), break it into steps ("Complete the Claude Code course"), and give it a daily habit ("Work 1 hour") with a reminder time. You get a streak counter and the last 14 days at a glance.
- **Today.** One screen with today's spending, today's habits, starred Gmail emails, and Google Classroom work that's due.

Your data is saved in the browser on each device. There's no server and no account. Use **Settings → Export backup** now and then, and **Import backup** to move your data to another device.

## Run it on your computer

Any static web server works. With Python installed:

```
cd expense-goals-app
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it on your phone

The app needs to be online at an `https://` address. It is hosted for free on GitHub Pages at **https://jovandukic20007-alt.github.io/budget-day/**. Open that address on your phone:

- **Android (Chrome):** menu ⋮ → *Add to Home screen* / *Install app*.
- **iPhone (Safari):** Share → *Add to Home Screen*.

## Reminders

- Browser notifications (Settings → Turn on notifications) only fire while the app is open or was opened recently. Phones close idle web apps.
- For a reminder that **never misses**, tap **📅 Add daily reminder to Google Calendar** on a goal. It creates a daily repeating event, and your phone's calendar app sends the notification.

## Connect Gmail and Google Classroom (one time, about 10 minutes)

The app only **reads** your data. It never sends, deletes or changes anything in Google.

1. Go to https://console.cloud.google.com/ and create a project (any name, e.g. "My Day").
2. **APIs & Services → Library**: enable **Gmail API** and **Google Classroom API**.
3. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform"):
   - User type: **External**. App name: My Day. Add your email as support and developer contact.
   - Scopes: you can skip this step. The app asks for them when you sign in.
   - **Audience / Test users:** add your own Gmail address (and your school account if Classroom uses a different one). Leave the app in **Testing**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** add the address where the app runs, `https://jovandukic20007-alt.github.io` and `http://localhost:8000` (no path, no trailing slash).
   - Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. In the app: **Settings → Google**, paste the client ID, tap **Save**, then **Connect Google**.
6. Google shows a warning that it "hasn't verified this app". That's expected for a private app you made yourself. Tap **Continue**.

**What shows up as tasks:**

- **Gmail:** emails matching the search in Settings. By default that's starred emails (`is:starred -in:trash`). So star an email and it becomes a task. You can use any Gmail search, e.g. `label:todo` or `is:starred newer_than:14d`.
- **Classroom:** work that you haven't turned in, due from 7 days ago up to 3 weeks ahead, plus new work with no due date.

Tick a task off in the app to mark it done for yourself. That doesn't change anything in Gmail or Classroom.

**Notes:**

- In Testing mode Google sign-in lasts about an hour per session. After that, tap **Refresh** to sign in again. The last list you loaded stays visible in the meantime.
- If your Classroom is on a **school account**, the school's admin may block outside apps. If so, Classroom shows an error and Gmail still works.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page and its four sections |
| `styles.css` | Look and feel, light and dark mode |
| `app.js` | Expenses, goals, reminders, backup |
| `google.js` | Gmail + Classroom (read-only) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Lets it install on your phone and open offline |
