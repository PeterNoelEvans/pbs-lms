document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const parentName = document.getElementById('parentName').value;
    const studentNickname = document.getElementById('studentNickname').value;
    const classSelect = document.getElementById('classSelect').value;
    
    // Store the information in sessionStorage
    sessionStorage.setItem('parentName', parentName);
    sessionStorage.setItem('studentNickname', studentNickname);
    
    // Redirect to the appropriate class page
    window.location.href = `class-${classSelect}.html`;
}); 