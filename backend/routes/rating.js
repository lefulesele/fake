const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get ratings
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [ratings] = await pool.execute(`
            SELECT r.*, u.name as user_name
            FROM ratings r
            JOIN users u ON r.user_id = u.id
            ORDER BY r.created_at DESC
        `);
        res.json({ ratings });
    } catch (error) {
        console.error('Get ratings error:', error);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

module.exports = router;