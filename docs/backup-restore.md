# Backup And Restore

## Demo Runtime

Create a JSON snapshot of the backend demo store:

```bash
npm run backup
```

Validate that the snapshot is readable:

```bash
npm run restore
```

## PostgreSQL Runtime

The Docker Compose file starts PostgreSQL with a named volume. For production use:

```bash
docker compose exec postgres pg_dump -U gecko -d gecko_next > storage/backups/gecko_next.sql
docker compose exec -T postgres psql -U gecko -d gecko_next < storage/backups/gecko_next.sql
```

