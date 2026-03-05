# DNS + TLS Setup

1. Create DNS A/AAAA record for qr-tickets.connsura.com -> production host.
2. Configure Nginx vhost for qr-tickets.connsura.com.
3. Provision TLS certificate (Let's Encrypt).
4. Force HTTPS redirect.
5. Verify:
   - https://qr-tickets.connsura.com
   - https://qr-tickets.connsura.com/health proxy endpoint
