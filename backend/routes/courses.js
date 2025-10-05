const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all courses
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [courses] = await pool.execute(`
            SELECT c.*, u.name as program_leader_name 
            FROM courses c 
            LEFT JOIN users u ON c.program_leader_id = u.id
            ORDER BY c.course_code
        `);
        res.json({ courses });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

module.exports = router;