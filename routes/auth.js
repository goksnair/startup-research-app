const express = require('express');
const router = express.Router();
const {
    registerValidation,
    loginValidation,
    handleValidationErrors,
    hashPassword,
    comparePassword,
    generateToken,
    authenticateToken
} = require('../middleware/auth');

// Register endpoint

// Register endpoint
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
    try {
        const { email, password, name } = req.body;

        // Check if user already exists
        const { data: existingUser } = await req.supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create user
        const { data: newUser, error } = await req.supabase
            .from('users')
            .insert({
                email,
                password_hash: passwordHash,
                name
            })
            .select('id, email, name, created_at')
            .single();

        if (error) {
            console.error('Registration error:', error);
            return res.status(500).json({ error: 'Failed to create user' });
        }

        // Generate JWT token
        const token = generateToken(newUser);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                created_at: newUser.created_at
            },
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login endpoint
router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const { data: user, error } = await req.supabase
            .from('users')
            .select('id, email, name, password_hash, is_active')
            .eq('email', email)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        // Verify password
        const isValidPassword = await comparePassword(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Update last login
        await req.supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

        // Generate JWT token
        const token = generateToken(user);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { data: user, error } = await req.supabase
            .from('users')
            .select('id, email, name, created_at, last_login, subscription_tier')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get usage statistics
        const { data: usage } = await req.supabase
            .from('user_usage')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(30);

        // Get recent research count
        const { count: recentResearchCount } = await req.supabase
            .from('research_queries')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        res.json({
            user,
            statistics: {
                recent_research_count: recentResearchCount || 0,
                usage_history: usage || []
            }
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Logout endpoint (optional - mainly for session cleanup)
router.post('/logout', (req, res) => {
    // Since we're using stateless JWT, logout is handled on the client side
    // This endpoint can be used for session cleanup if needed
    res.json({ message: 'Logout successful' });
});

module.exports = router;
