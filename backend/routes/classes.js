const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all classes
router.get('/', authenticateToken, async (req, res) => {
    try {
        let query = `
            SELECT c.*, 
                   co.course_code, co.course_name,
                   u.name as lecturer_name
            FROM classes c
            LEFT JOIN courses co ON c.course_id = co.id
            LEFT JOIN users u ON c.lecturer_id = u.id
            WHERE 1=1
        `;
        const params = [];

        // Role-based filtering
        if (req.user.role === 'lecturer') {
            query += ' AND c.lecturer_id = ?';
            params.push(req.user.id);
        }

        query += ' ORDER BY c.class_name';

        const [classes] = await pool.execute(query, params);
        res.json({ classes });
    } catch (error) {
        console.error('Get classes error:', error);
        res.status(500).json({ error: 'Failed to fetch classes' });
    }
});

module.exports = router;