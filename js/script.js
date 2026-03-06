// JavaScript for mobile menu toggle, smooth scrolling, form validation, and interactive features for the travel agency website

// Mobile menu toggle
const menuToggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.menu');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        menu.classList.toggle('active');
    });
}

// Smooth scrolling
const scrollLinks = document.querySelectorAll('a[href^="#"]');

scrollLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Form validation
const form = document.querySelector('form');

if (form) {
    form.addEventListener('submit', (e) => {
        const nameInput = form.querySelector('input[name="name"]');
        const emailInput = form.querySelector('input[name="email"]');
        const messageInput = form.querySelector('textarea[name="message"]');
        
        if (nameInput && emailInput && messageInput) {
            const name = nameInput.value;
            const email = emailInput.value;
            const message = messageInput.value;
            
            if (!name || !email || !message) {
                e.preventDefault();
                alert('Please fill in all fields.');
            }
        }
    });
}

// Interactive hover effects
document.querySelectorAll('.interactive').forEach(item => {
    item.addEventListener('mouseover', () => {
        item.classList.add('hover');
    });
    item.addEventListener('mouseout', () => {
        item.classList.remove('hover');
    });
});

// Display current date and time
function displayCurrentDateTime() {
    const currentDate = new Date();
    const formattedDate = currentDate.toUTCString();
    const dateTimeElement = document.getElementById('dateTimeDisplay');
    if (dateTimeElement) {
        dateTimeElement.innerText = formattedDate;
    }
}

// Call the function on page load
window.addEventListener('load', function() {
    displayCurrentDateTime();
});