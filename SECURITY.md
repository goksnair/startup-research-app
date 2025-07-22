# Database Security Configuration

## Authentication Approach

This application uses **JWT-based authentication** instead of Supabase's built-in authentication system. Security is handled at the application level through our custom authentication middleware.

## Why RLS is Disabled

Row Level Security (RLS) policies are commented out because:

1. **Custom JWT Authentication**: We use our own JWT tokens and user management
2. **Application-Level Security**: Security is enforced through Express middleware (`middleware/auth.js`)
3. **Database Agnostic**: This approach works with any PostgreSQL database, not just Supabase

## Security Measures in Place

### 1. Authentication Middleware (`middleware/auth.js`)
- Validates JWT tokens on protected routes
- Extracts user information from tokens
- Blocks unauthorized access at the API level

### 2. Route-Level Protection
- All sensitive endpoints require authentication
- User ID is extracted from JWT and used in database queries
- Users can only access their own data through proper query filtering

### 3. Database Security
- Foreign key constraints ensure data integrity
- Input validation prevents SQL injection
- Parameterized queries used throughout the application

## Alternative: Enable Supabase RLS (Future Enhancement)

If you want to migrate to Supabase Auth and enable RLS:

1. Replace JWT authentication with Supabase Auth
2. Uncomment the RLS policies in `database/schema.sql`
3. Update frontend to use Supabase Auth client
4. Modify API routes to work with `auth.uid()`

## Current Security Flow

```
Client Request → JWT Token → Auth Middleware → User ID → Database Query with User Filter
```

This ensures users can only access their own data while maintaining flexibility and database portability.
