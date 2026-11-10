# My Day

A personal web app for your phone and computer with three parts:

- **Expenses.** Log what you spend each day. You get a short daily summary, a day-by-day list, a breakdown by category, and a monthly bar with your target (800 €) and hard limit (1,000 €). The bar turns orange above the target and red above the limit.
- **Goals.** A tree of goals. Start with a big goal ("Be rich", "End phone addiction"), add the goals that get you there under it ("Get into a good university", "Learn Claude Code"), and go as deep as you like. Any goal can have steps with optional due dates, and a habit ("No phone 1 hour before bed") that repeats on the days you choose, with a reminder time and a streak. Today shows your big goals at the top as a reminder.
- **Tasks.** Everyday to-dos that aren't part of a goal, with an optional date and time. They're grouped into Overdue, Today, Tomorrow, Later and Anytime, and today's tasks also appear on Today and in the Calendar.
- **Routine.** Things you tick off every day ("Drink 90 oz of water", "Walk 2 km"). The boxes clear at midnight, and each item keeps a streak. You also get a count of perfect days in a row and a 14-day chart. Your routine shows on Today too.
- **School.** Your subjects with a weekly timetable (days, times, room, teacher), homework with due dates, upcoming tests with a countdown, and grades with an average per subject. Today shows your classes, homework due today or tomorrow and tests this week. At 6 pm you get a reminder if there's a test or homework due tomorrow. Google Classroom work shows here too.
- **Calendar.** A month view of your habits, steps, homework, tests, Classroom due dates and spending.
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

## Habit schedules and reminders

Each habit repeats on the days you pick: any weekdays, every 1–4 weeks, from a start date and optionally until an end date. Change it later with **Change habit or schedule** on the goal. Habits only show on Today, in the calendar and in your streak on the days they're scheduled.

Turn on notifications in Settings to get a nudge at the reminder time on scheduled days. Phones pause web apps in the background, so reminders are most reliable when you open the app once a day.

## Calendar

The **Calendar** tab shows each month with your scheduled habits (done, missed or coming up), goal steps with a due date, Google Classroom due dates and how much you spent each day. Tap a day to see the details and tick things off.

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
| `school.js` | School tab: subjects, timetable, homework, tests, grades |
| `sw.js`, `manifest.webmanifest`, `icons/` | Lets it install on your phone and open offline |
