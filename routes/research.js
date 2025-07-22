const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get user's research history
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, company, analysis_type } = req.query;
        const offset = (page - 1) * limit;

        let query = req.supabase
            .from('research_queries')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Apply filters
        if (company) {
            query = query.ilike('company', `%${company}%`);
        }
        if (analysis_type) {
            query = query.eq('analysis_type', analysis_type);
        }

        const { data: research, error } = await query;

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch research history' });
        }

        // Get total count for pagination
        let countQuery = req.supabase
            .from('research_queries')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);

        if (company) countQuery = countQuery.ilike('company', `%${company}%`);
        if (analysis_type) countQuery = countQuery.eq('analysis_type', analysis_type);

        const { count } = await countQuery;

        res.json({
            research,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / limit)
            }
        });

    } catch (error) {
        console.error('Research history error:', error);
        res.status(500).json({ error: 'Failed to fetch research history' });
    }
});

// Get specific research by ID
router.get('/history/:id', authenticateToken, async (req, res) => {
    try {
        const { data: research, error } = await req.supabase
            .from('research_queries')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();

        if (error || !research) {
            return res.status(404).json({ error: 'Research not found' });
        }

        res.json(research);

    } catch (error) {
        console.error('Research fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch research' });
    }
});

// Toggle favorite status
router.patch('/history/:id/favorite', authenticateToken, async (req, res) => {
    try {
        const { is_favorite } = req.body;

        const { data: research, error } = await req.supabase
            .from('research_queries')
            .update({ is_favorite })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error || !research) {
            return res.status(404).json({ error: 'Research not found' });
        }

        res.json({ message: 'Favorite status updated', research });

    } catch (error) {
        console.error('Favorite update error:', error);
        res.status(500).json({ error: 'Failed to update favorite status' });
    }
});

// Delete research
router.delete('/history/:id', authenticateToken, async (req, res) => {
    try {
        const { error } = await req.supabase
            .from('research_queries')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.user.id);

        if (error) {
            return res.status(500).json({ error: 'Failed to delete research' });
        }

        res.json({ message: 'Research deleted successfully' });

    } catch (error) {
        console.error('Research deletion error:', error);
        res.status(500).json({ error: 'Failed to delete research' });
    }
});

// Export research history
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const { format = 'json' } = req.query;

        const { data: research, error } = await req.supabase
            .from('research_queries')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ error: 'Failed to export research' });
        }

        if (format === 'csv') {
            // Convert to CSV
            const csvHeaders = 'ID,Company,Analysis Type,Query,Created At,Tokens Used,Is Favorite\n';
            const csvData = research.map(r =>
                `"${r.id}","${r.company}","${r.analysis_type}","${r.query.replace(/"/g, '""')}","${r.created_at}","${r.tokens_used}","${r.is_favorite}"`
            ).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=research_export.csv');
            res.send(csvHeaders + csvData);
        } else {
            // Return as JSON
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=research_export.json');
            res.json({
                export_date: new Date().toISOString(),
                user_id: req.user.id,
                total_research: research.length,
                research
            });
        }

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export research' });
    }
});

module.exports = router;
