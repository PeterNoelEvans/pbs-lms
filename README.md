# Student Portfolio System - Registration Guide

## For Students

### Registration Steps
1. Go to https://codinghtml-presentation.onrender.com/login.html
2. Click the "Register Instead" button
3. Enter your credentials:
   - Username: Your given username (e.g., "Peter41" for class 4/1 or "Peter42" for class 4/2)
   - Password: Your assigned password (format: Name2025[Letter])
   - Portfolio Path: Select your portfolio from the dropdown list

### After Registration
1. Go to https://codinghtml-presentation.onrender.com/login.html
2. Log in with your username and password
3. You will be directed to your dashboard
4. Use the toggle switch to set your portfolio as public or private:
   - Public: Everyone can see your portfolio
   - Private: Only you and your parents can see your portfolio (default setting)

### Portfolio Features

#### Python Turtle Editor
The system includes an interactive Python Turtle Editor that allows you to:
1. Create beautiful graphics using Python's Turtle module
2. Write and test Python code directly in your browser
3. Try pre-made examples like stars, spirals, and flowers
4. Add your creations to your portfolio

To access the Turtle Editor:
1. Log in to your dashboard
2. Find the "Coding Tools" section
3. Click on "Python Turtle Editor"
4. Start creating!

Tips for using the Turtle Editor:
- Use the example buttons to learn from pre-made patterns
- Experiment with different colors and shapes
- Save your favorite code to add to your portfolio
- The editor includes helpful tips and documentation

### Portfolio Structure
When you register, the system automatically creates:
1. Your portfolio directory in the correct class folder
2. An `images` folder for your media
3. Your initial portfolio HTML file

Note: For technical details about portfolio paths and directory structure, please refer to `CODEBASE_GUIDE.md`.

#### Adding Your Avatar Image
1. Your avatar should be placed in your `images` folder
2. Name it exactly like your username (e.g., "Peter42.png" or "Peter42.jpg")
3. Supported formats: .png, .jpg, or .jpeg
4. Preferably use a square (1:1 aspect ratio) image

For example, if your username is "Peter42", your portfolio structure will be:
```
/portfolios/
  /P4-2/
    /Peter/
      /images/
        Peter42.png (or Peter42.jpg)
      Peter.html
```

### Important Notes for Students
- You can change your portfolio visibility at any time through the dashboard
- You can always see your own portfolio, regardless of its visibility setting
- You can see other students' portfolios only if they are set to public
- All portfolios are private by default when created
- Your portfolio and images folders are created automatically upon registration

## For Parents

### Registration Steps
1. Go to https://codinghtml-presentation.onrender.com/login.html
2. Click the "Register Instead" button
3. Enter your credentials:
   - Username: "parent-" followed by your child's username (e.g., "parent-peter41")
   - Password: Same as your child's password
   - Portfolio Path: Select your child's portfolio from the dropdown list

### After Registration
1. Go to https://codinghtml-presentation.onrender.com/login.html
2. Log in with your parent username and password
3. You will be directed to your dashboard

### Important Notes for Parents
- You can always see your child's portfolio, regardless of its visibility setting
- You can only see other students' portfolios if they are set to public
- Your account is linked to your child's portfolio for easy access

## Class 4/1 Student Credentials
| Student | Username | Password | Portfolio Path |
|---------|----------|----------|----------------|
| Peter | Peter41 | Peter2025AA | /portfolios/P4-1/Peter/Peter.html |
| Peta | Peta | Peta2025A | /portfolios/P4-1/Peta/Peta.html |
[etc...]

## Class 4/2 Student Credentials
| Student | Username | Password | Portfolio Path |
|---------|----------|----------|----------------|
| Peter | Peter42 | Peter2025BB | /portfolios/P4-2/Peter/Peter.html |
| Chapter | Chapter | Chapter2025A | /portfolios/P4-2/Chapter/Chapter.html |
[etc...]

## Privacy Features
- Students can set their portfolios to public or private
- Private portfolios are only visible to:
  1. The student who owns the portfolio
  2. The student's parents
  3. Teachers/administrators
- Public portfolios are visible to everyone

## Support
If you have any issues:
1. Make sure you're using the correct username and password
2. Check that your portfolio path matches exactly
3. Try logging out and logging back in
4. Contact the administrator if problems persist

## Security Notes
- Keep your password secure
- Don't share your login credentials
- Log out when you're done
- Use the dashboard to manage your portfolio visibility

### Features

#### Portfolio Management
- Create and manage student portfolios
- Set portfolio privacy (public/private)
- Upload and manage avatar images
- Parent access to child portfolios

#### Code Showcase
- Upload and display coding project videos
- Share static code images
- Direct file linking from portfolio pages
- Supports various video formats (MP4, WebM)

#### Getting Started
1. Register for an account
2. Set up your portfolio
3. Upload your avatar image
4. Add your coding projects:
   - Create a videos/ folder in your portfolio directory
   - Add your project videos and code images
   - Link them in your portfolio HTML file

#### File Organization
Each student's portfolio should have the following structure:
```
portfolios/
  P4-1/ or P4-2/
    StudentName/
      StudentName.html
      images/
        StudentName.png (avatar)
      videos/
        project1.mp4
        project2.mp4
      code-images/
        project1-code.png
        project2-code.png
```

#### Adding Videos and Code Images
1. Create the necessary folders in your portfolio directory
2. Upload your video files (MP4, WebM) to the videos/ folder
3. Take screenshots or export images of your code
4. Add them to your portfolio HTML using standard HTML tags:
```html
<!-- Video example -->
<video controls width="100%">
    <source src="videos/my-project.mp4" type="video/mp4">
    Your browser does not support the video tag.
</video>

<!-- Code image example -->
<img src="code-images/my-code.png" alt="My Project Code">
```

## Class Paths and Portfolio Structure

### Important: Class Directory Names
The system uses specific directory names for each class. These names are fixed and must be used exactly as shown:

| Class Display Name | Directory Name | Example Path |
|-------------------|----------------|--------------|
| M2 2025 | ClassM2-001 | /portfolios/ClassM2-001/StudentName/StudentName.html |
| Class 4/1 | P4-1 | /portfolios/P4-1/StudentName/StudentName.html |
| Class 4/2 | P4-2 | /portfolios/P4-2/StudentName/StudentName.html |

⚠️ IMPORTANT NOTES:
1. Directory names are case-sensitive
2. Do NOT use alternative names (e.g., do not use 'M2' or 'M2-2025' instead of 'ClassM2-001')
3. Always use the exact directory names as specified above
4. The system will look for portfolios only in these exact paths

### Portfolio Structure Example for M2 2025
```
portfolios/
  ClassM2-001/           # Exact directory name for M2 2025
    StudentName/
      StudentName.html   # Main portfolio file
      images/
        StudentName.jpg  # Avatar image
      videos/
        project1.mp4
```

### Common Issues and Solutions
1. If portfolios are not appearing:
   - Check that you're using the exact directory name (e.g., 'ClassM2-001' not 'M2')
   - Verify the case sensitivity of all folder names
   - Ensure the portfolio path in the database matches the filesystem path

2. For new class setups:
   - Always use the standardized directory names as shown in the table above
   - Update both the database entries and filesystem paths to match
   - Test the paths before deploying 