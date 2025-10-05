const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Register new user
router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    body('role').isIn(['student', 'lecturer', 'principal_lecturer', 'program_leader'])
], handleValidationErrors, async (req, res) => {
    try {
        const { email, password, name, role, faculty, department, stream } = req.body;

        // Check if user already exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Insert new user
        const [result] = await pool.execute(
            'INSERT INTO users (email, password, name, role, faculty, department, stream) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, name, role, faculty || 'Faculty of Information Communication Technology', department, stream]
        );
        
        res.status(201).json({ 
            message: 'User registered successfully',
            userId: result.insertId 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error during registration' });
    }
});

// Login user
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Create JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                role: user.role,
                name: user.name 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        // Remove password from user object
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: 'Login successful',
            token,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error during login' });
    }
});

// Get current user profile
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [users] = await pool.execute(
            'SELECT id, email, name, role, faculty, department, stream, created_at FROM users WHERE id = ?',
            [decoded.id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;