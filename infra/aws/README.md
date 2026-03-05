# AWS Isolation Plan for QR Tickets

- Separate EC2 instance (or ECS service) dedicated to qr-tickets.
- Separate PostgreSQL database instance/cluster and credentials.
- Separate S3 buckets:
  - qr-tickets-assets
  - qr-tickets-exports
  - qr-tickets-backups
- Separate IAM roles/policies scoped only to QR resources.
- Shared services allowed:
  - AWS SES (separate config set/domain identity recommended)
  - Zoho Mail
