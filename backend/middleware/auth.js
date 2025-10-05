const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user still exists in database
        const [users] = await pool.execute(
            'SELECT id, email, name, role, faculty, department, stream FROM users WHERE id = ?',
            [decoded.id]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'User no longer exists' });
        }

        req.user = users[0];
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(403).json({ error: 'Invalid or expired token' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Access denied. Insufficient permissions.',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
};

// Specific role middlewares
const requireLecturer = requireRole(['lecturer']);
const requirePrincipalLecturer = requireRole(['principal_lecturer']);
const requireProgramLeader = requireRole(['program_leader']);
const requireStudent = requireRole(['student']);

module.exports = {
    authenticateToken,
    requireRole,
    requireLecturer,
    requirePrincipalLecturer,
    requireProgramLeader,
    requireStudent
};