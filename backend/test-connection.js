const oracledb = require('oracledb');

async function testConnection() {
  console.log('🔧 Testing Oracle connection with correct password...\n');

  const config = {
    user: 'C##ADMIN',
    password: 'Admin123',
    connectString: 'localhost:1521/freepdb1'
  };

  try {
    console.log('🔄 Testing connection to FREEPDB1...');
    const connection = await oracledb.getConnection(config);
    console.log('✅ SUCCESS: Connected to Oracle 23ai Free!');
    
    // Check container info
    const containerResult = await connection.execute(`
      SELECT SYS_CONTEXT('USERENV', 'CON_NAME') as container_name,
             SYS_CONTEXT('USERENV', 'DB_NAME') as db_name
      FROM dual
    `);
    console.log(`📊 Database: ${containerResult.rows[0][1]}`);
    console.log(`📋 Container: ${containerResult.rows[0][0]}`);
    
    // Create the tables your application needs
    console.log('\n📋 Creating application tables...');
    
    // Users table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'DROP TABLE users CASCADE CONSTRAINTS';
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    `);
    
    await connection.execute(`
      CREATE TABLE users (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR2(100) NOT NULL,
        email VARCHAR2(255) UNIQUE NOT NULL,
        password VARCHAR2(255) NOT NULL,
        role VARCHAR2(50) DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created users table');
    
    // Courses table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'DROP TABLE courses CASCADE CONSTRAINTS';
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    `);
    
    await connection.execute(`
      CREATE TABLE courses (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id NUMBER NOT NULL,
        course_code VARCHAR2(50) NOT NULL,
        course_name VARCHAR2(100) NOT NULL,
        instructor VARCHAR2(100),
        credits NUMBER,
        semester VARCHAR2(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created courses table');
    
    // Grades table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'DROP TABLE grades CASCADE CONSTRAINTS';
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    `);
    
    await connection.execute(`
      CREATE TABLE grades (
        id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id NUMBER NOT NULL,
        course_id NUMBER NOT NULL,
        course_name VARCHAR2(100) NOT NULL,
        assignment VARCHAR2(100),
        grade VARCHAR2(10),
        semester VARCHAR2(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Created grades table');
    
    // Insert sample data
    console.log('\n📝 Inserting sample data...');
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password', 12);
    
    // Insert sample user
    const userResult = await connection.execute(
      `INSERT INTO users (name, email, password, role) 
       VALUES ('Test User', 'test@example.com', :password, 'student')
       RETURNING id INTO :id`,
      {
        password: hashedPassword,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );
    
    const userId = userResult.outBinds.id[0];
    console.log(`   ✅ Inserted sample user with ID: ${userId}`);
    
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
    console.log('   ✅ Inserted sample courses');
    
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
    console.log('   ✅ Inserted sample grades');
    
    // Verify data
    const usersCount = await connection.execute('SELECT COUNT(*) FROM users');
    const coursesCount = await connection.execute('SELECT COUNT(*) FROM courses');
    const gradesCount = await connection.execute('SELECT COUNT(*) FROM grades');
    
    console.log('\n📊 Data Summary:');
    console.log(`   Users: ${usersCount.rows[0][0]}`);
    console.log(`   Courses: ${coursesCount.rows[0][0]}`);
    console.log(`   Grades: ${gradesCount.rows[0][0]}`);
    
    await connection.close();
    
    console.log('\n🎉 SUCCESS! Oracle database is ready for your application!');
    console.log('========================================================');
    console.log('DB_USER=C##ADMIN');
    console.log('DB_PASSWORD=Admin123');
    console.log('DB_CONNECTION_STRING=localhost:1521/freepdb1');
    console.log('========================================================');
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testConnection().catch(console.error);