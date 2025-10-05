const express = require('express');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken, requireLecturer } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Get all reports with search and filters
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT r.*, 
                   c.course_code, c.course_name,
                   u.name as lecturer_name,
                   cl.class_name
            FROM reports r
            LEFT JOIN courses c ON r.course_id = c.id
            LEFT JOIN users u ON r.lecturer_id = u.id
            LEFT JOIN classes cl ON r.class_id = cl.id
            WHERE 1=1
        `;
        let countQuery = `SELECT COUNT(*) as total FROM reports r WHERE 1=1`;
        const params = [];
        const countParams = [];

        // Role-based filtering
        if (req.user.role === 'lecturer') {
            query += ' AND r.lecturer_id = ?';
            countQuery += ' AND r.lecturer_id = ?';
            params.push(req.user.id);
            countParams.push(req.user.id);
        }

        // Search functionality
        if (search) {
            const searchCondition = `
                AND (c.course_name LIKE ? OR c.course_code LIKE ? 
                OR u.name LIKE ? OR r.topic_taught LIKE ? OR cl.class_name LIKE ?)
            `;
            query += searchCondition;
            countQuery += searchCondition;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
            countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
        }

        query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [reports] = await pool.execute(query, params);
        const [countResult] = await pool.execute(countQuery, countParams);

        res.json({
            reports,
            total: countResult[0].total,
            page: parseInt(page),
            totalPages: Math.ceil(countResult[0].total / limit)
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Create new report
router.post('/', authenticateToken, requireLecturer, [
    body('class_id').isInt(),
    body('week_of_reporting').notEmpty(),
    body('date_of_lecture').isDate(),
    body('course_id').isInt(),
    body('actual_students_present').isInt({ min: 0 }),
    body('topic_taught').notEmpty(),
    body('learning_outcomes').notEmpty()
], handleValidationErrors, async (req, res) => {
    try {
        const {
            faculty_name, class_id, week_of_reporting, date_of_lecture,
            course_id, actual_students_present, total_registered_students,
            venue, scheduled_lecture_time, topic_taught, learning_outcomes, recommendations
        } = req.body;

        const [result] = await pool.execute(
            `INSERT INTO reports (
                faculty_name, class_id, week_of_reporting, date_of_lecture, course_id,
                lecturer_id, actual_students_present, total_registered_students,
                venue, scheduled_lecture_time, topic_taught, learning_outcomes, recommendations
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                faculty_name || 'Faculty of Information Communication Technology',
                class_id, week_of_reporting, date_of_lecture, course_id,
                req.user.id, actual_students_present, total_registered_students,
                venue, scheduled_lecture_time, topic_taught, learning_outcomes, recommendations
            ]
        );

        res.status(201).json({ 
            message: 'Report created successfully', 
            reportId: result.insertId 
        });
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ error: 'Failed to create report' });
    }
});

module.exports = router;