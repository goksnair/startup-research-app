#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

echo "Setting up Vercel environment variables for production..."

# Set Supabase URL
echo "Setting SUPABASE_URL..."
echo "$SUPABASE_URL" | vercel env add SUPABASE_URL production

# Set Supabase Anon Key
echo "Setting SUPABASE_ANON_KEY..."
echo "$SUPABASE_ANON_KEY" | vercel env add SUPABASE_ANON_KEY production

# Set JWT Secret
echo "Setting JWT_SECRET..."
echo "$JWT_SECRET" | vercel env add JWT_SECRET production

# Set Node Environment
echo "Setting NODE_ENV..."
echo "production" | vercel env add NODE_ENV production

echo "✅ All environment variables have been set up for production!"
echo "Redeploying to apply changes..."

# Redeploy to production
vercel --prod
