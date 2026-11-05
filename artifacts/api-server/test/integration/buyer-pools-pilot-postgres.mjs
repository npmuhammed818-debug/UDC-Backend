// Same real SQL/HTTP scenarios, plus stricter staging pilot gates.
process.env.UDC_APP_ENV='staging';
await import('./buyer-pools-postgres.mjs');
