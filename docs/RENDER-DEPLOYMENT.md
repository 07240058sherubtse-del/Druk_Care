# Render deployment

1. Push this project to a GitHub repository and create a Render Blueprint from it. Render reads `render.yaml` to create the PostgreSQL database, web service, and reminder worker.
2. Set `BASE_URL` on the web service to its public HTTPS URL (for example, `https://drukcare-web.onrender.com`).
3. Add SMTP credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) to both services and set `SUPPORT_EMAIL` on the web service. Use TLS settings appropriate for your provider. Registration, password reset, and contact form delivery require mail configuration.
4. Wait for the first web deployment. Its pre-deploy command runs database migrations and the base-directory seeder. The seeder adds the 20 Dzongkhags and department names only; no hospitals or doctors are fabricated.
5. In the web service's Shell, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 16 characters), then run `npm run admin:create`. Do not add these values to source control.
6. Sign in with the administrator account, add facilities with reliable source URLs, verify each record, and only enable online booking after schedules and operational details have been confirmed. Add doctors and their availability.
7. Check the web service health at `/`, confirm the worker is running in its logs, and test registration/verification, bookings, cancellation, rescheduling, and email delivery before announcing the site.

The worker checks confirmed appointments every minute. Keep one reminder worker instance to avoid unnecessary duplicate processing. Use a paid Render PostgreSQL plan with backups for production patient data, and configure retention and access policies appropriate to your privacy obligations.

Never commit `.env` or paste database, mail, or session credentials into the repository. Review current Render pricing, region availability, and blueprint behavior in your Render account before deployment.
