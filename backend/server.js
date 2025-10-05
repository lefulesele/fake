const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Oracle Configuration for 23ai Free
const dbConfig = {
  user: process.env.DB_USER || 'C##ADMIN',
  password: process.env.DB_PASSWORD || 'Admin123',
  connectString: process.env.DB_CONNECTION_STRING || 'localhost:1521/freepdb1',
  poolMin: 1,
  poolMax: 5,
  poolIncrement: 1,
  poolTimeout: 60
};

let pool = null;

// Initialize Database
const initializeDatabase = async () => {
  try {
    console.log('🔧 Connecting to Oracle 23ai Free...');
    
    pool = await oracledb.createPool(dbConfig);
    
    // Test connection with a simple query instead of system views
    const connection = await pool.getConnection();
    const result = await connection.execute('SELECT 1 as test FROM dual');
    
    console.log('✅ Oracle 23ai Free Connected Successfully!');
    console.log(`📊 Connection test: ${result.rows[0][0]}`);
    
    await connection.close();
    
    // Initialize tables
    await createTables();
    await insertSampleData();
    
  } catch (error) {
    console.error('❌ Oracle connection failed:', error.message);
    console.log('⚠️ Using mock data instead');
    pool = null;
  }
};

const createTables = async () => {
  if (!pool) return;
  
  try {
    const connection = await pool.getConnection();
    
    // Create users table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE users (
          id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name VARCHAR2(100) NOT NULL,
          email VARCHAR2(255) UNIQUE NOT NULL,
          password VARCHAR2(255) NOT NULL,
          role VARCHAR2(50) DEFAULT ''student'',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
        DBMS_OUTPUT.PUT_LINE('Users table created');
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
      END;
    `);
    
    // Create courses table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE courses (
          id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id NUMBER NOT NULL,
          course_code VARCHAR2(50) NOT NULL,
          course_name VARCHAR2(100) NOT NULL,
          instructor VARCHAR2(100),
          credits NUMBER,
          semester VARCHAR2(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
        DBMS_OUTPUT.PUT_LINE('Courses table created');
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
      END;
    `);
    
    // Create grades table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE grades (
          id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id NUMBER NOT NULL,
          course_id NUMBER NOT NULL,
          course_name VARCHAR2(100) NOT NULL,
          assignment VARCHAR2(100),
          grade VARCHAR2(10),
          semester VARCHAR2(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
        DBMS_OUTPUT.PUT_LINE('Grades table created');
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
      END;
    `);
    
    await connection.close();
    console.log('✅ Database tables ready');
  } catch (error) {
    console.log('ℹ️ Tables already exist:', error.message);
  }
};

const insertSampleData = async () => {
  if (!pool) return;
  
  try {
    const connection = await pool.getConnection();
    
    // Check if sample user exists
    const userCheck = await connection.execute(
      'SELECT id FROM users WHERE email = :email',
      { email: 'test@example.com' }
    );
    
    if (userCheck.rows.length === 0) {
      // Create sample user
      const hashedPassword = await bcrypt.hash('password', 12);
      
      const userResult = await connection.execute(
        `INSERT INTO users (name, email, password, role) 
         VALUES (:name, :email, :password, :role) 
         RETURNING id INTO :id`,
        {
          name: 'Test User',
          email: 'test@example.com',
          password: hashedPassword,
          role: 'student',
          id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );
      
      const userId = userResult.outBinds.id[0];
      
      // Insert sample courses
      await connection.execute(
        `INSERT INTO courses (user_id, course_code, course_name, instructor, credits, semester) 
         VALUES (:userId, 'MATH101', 'Mathematics 101', 'Dr. Smith', 3, 'Spring 2024')`,
        { userId },
        { autoCommit: true }
      );
      
      await connection.execute(
        `INSERT INTO courses (user_id, course_code, course_name, instructor, credits, semester) 
         VALUES (:userId, 'CS101', 'Computer Science Fundamentals', 'Dr. Johnson', 4, 'Spring 2024')`,
        { userId },
        { autoCommit: true }
      );
      
      // Insert sample grades
      await connection.execute(
        `INSERT INTO grades (user_id, course_id, course_name, assignment, grade, semester) 
         VALUES (:userId, 1, 'Mathematics 101', 'Midterm Exam', 'A', 'Spring 2024')`,
        { userId },
        { autoCommit: true }
      );
      
      await connection.execute(
        `INSERT INTO grades (user_id, course_id, course_name, assignment, grade, semester) 
         VALUES (:userId, 2, 'Computer Science Fundamentals', 'Project 1', 'B+', 'Spring 2024')`,
        { userId },
        { autoCommit: true }
      );
      
      console.log('✅ Sample data inserted into Oracle');
    }
    
    await connection.close();
  } catch (error) {
    console.log('ℹ️ Sample data already exists:', error.message);
  }
};

// Utility function to get database connection
const getConnection = async () => {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return await pool.getConnection();
};

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (pool) {
      const connection = await getConnection();
      const result = await connection.execute(
        'SELECT id, name, email, role FROM users WHERE id = :id',
        { id: decoded.id }
      );
      await connection.close();

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = {
        id: result.rows[0][0],
        name: result.rows[0][1],
        email: result.rows[0][2],
        role: result.rows[0][3]
      };

      req.user = user;
    } else {
      // Mock data fallback
      req.user = {
        id: decoded.id,
        name: 'Test User',
        email: decoded.email,
        role: decoded.role
      };
    }
    
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    database: pool ? 'Connected to Oracle 23ai Free' : 'Using mock data',
    timestamp: new Date().toISOString()
  });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (pool) {
      const connection = await getConnection();
      const result = await connection.execute(
        'SELECT id, name, email, password, role FROM users WHERE email = :email',
        { email }
      );

      if (result.rows.length === 0) {
        await connection.close();
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const user = {
        id: result.rows[0][0],
        name: result.rows[0][1],
        email: result.rows[0][2],
        password: result.rows[0][3],
        role: result.rows[0][4]
      };

      await connection.close();

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const token = generateToken(user);
      const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      res.json({
        message: 'Login successful (Oracle 23ai Free)',
        token,
        user: userResponse
      });

    } else {
      // Mock login fallback
      if (email === 'test@example.com' && password === 'password') {
        const mockUser = {
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
          role: 'student'
        };

        const token = generateToken(mockUser);

        res.json({
          message: 'Login successful (mock data)',
          token,
          user: mockUser
        });
      } else {
        res.status(400).json({ error: 'Invalid email or password' });
      }
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get user courses
app.get('/api/user/courses', authenticateToken, async (req, res) => {
  try {
    if (pool) {
      const connection = await getConnection();
      const result = await connection.execute(
        `SELECT id, course_code, course_name, instructor, credits, semester 
         FROM courses WHERE user_id = :user_id`,
        { user_id: req.user.id }
      );
      await connection.close();

      const courses = result.rows.map(row => ({
        id: row[0],
        course_code: row[1],
        course_name: row[2],
        instructor: row[3],
        credits: row[4],
        semester: row[5]
      }));

      res.json({ courses });
    } else {
      // Mock data fallback
      res.json({ 
        courses: [
          { id: 1, course_code: 'MATH101', course_name: 'Mathematics 101', instructor: 'Dr. Smith', credits: 3, semester: 'Spring 2024' },
          { id: 2, course_code: 'CS101', course_name: 'Computer Science Fundamentals', instructor: 'Dr. Johnson', credits: 4, semester: 'Spring 2024' }
        ] 
      });
    }
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Get user grades
app.get('/api/user/grades', authenticateToken, async (req, res) => {
  try {
    if (pool) {
      const connection = await getConnection();
      const result = await connection.execute(
        `SELECT id, course_name, assignment, grade, semester 
         FROM grades WHERE user_id = :user_id`,
        { user_id: req.user.id }
      );
      await connection.close();

      const grades = result.rows.map(row => ({
        id: row[0],
        course_name: row[1],
        assignment: row[2],
        grade: row[3],
        semester: row[4]
      }));

      res.json({ grades });
    } else {
      // Mock data fallback
      res.json({ 
        grades: [
          { id: 1, course_name: 'Mathematics 101', assignment: 'Midterm Exam', grade: 'A', semester: 'Spring 2024' },
          { id: 2, course_name: 'Computer Science Fundamentals', assignment: 'Project 1', grade: 'B+', semester: 'Spring 2024' }
        ] 
      });
    }
  } catch (error) {
    console.error('Get grades error:', error);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📍 Frontend: http://localhost:3000`); // Fixed this line - added closing quote and backtick
    
    if (pool) {
      console.log('✅ Connected to Oracle 23ai Free Database!');
      console.log('🔑 Test login: test@example.com / password');
    } else {
      console.log('⚠️ Using mock data - Oracle connection failed');
    }
  });
};

startServer();

module.exports = app;