const express = require('express');

const router = express.Router();

// Test route to verify batch routes are working
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Phase 3 Batch routes are working!',
        database: 'Schema deployed successfully',
        timestamp: new Date().toISOString()
    });
});

// Simple batch creation test without middleware
router.post('/create', (req, res) => {
    try {
        const { companies } = req.body;

        res.json({
            success: true,
            message: 'Phase 3 Batch endpoint is working',
            data: {
                companies: companies || [],
                status: 'ready-for-development'
            }
        });
    } catch (error) {
        console.error('Batch creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

module.exports = router;
