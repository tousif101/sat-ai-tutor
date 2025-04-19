// cypress/e2e/data-generator.cy.js

describe('SAT AI Tutor Data Generator', () => {
    const topics = ['Algebra', 'Geometry', 'Grammar', 'Reading Comprehension', 'Trigonometry'];
    const totalQuestionsToGenerate = 30; // Adjust as needed
    
    beforeEach(() => {
      // Login before each test
      cy.visit('/auth');
      cy.get('input[type="email"]').type('test@example.com');
      cy.get('input[type="password"]').type('password123');
      cy.contains('button', 'Login').click();
      
      // Wait for dashboard to load
      cy.url().should('include', '/dashboard');
    });
    
    it('Should generate SAT practice data', () => {
      // Generate questions and answers for each topic
      for (let i = 0; i < totalQuestionsToGenerate; i++) {
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        const willAnswerCorrectly = Math.random() > 0.4; // 60% correct answers
        const confidenceLevel = Math.floor(Math.random() * 5) + 1; // 1-5
        
        // Select topic
        cy.get('select').first().select(randomTopic);
        
        // Generate question
        cy.contains('button', 'Generate Question').click();
        
        // Wait for question to load
        cy.contains('Practice Question', { timeout: 15000 }).should('be.visible');
        
        // Random delay to simulate thinking time (5-30 seconds)
        const thinkingTime = Math.floor(Math.random() * 25000) + 5000;
        cy.wait(thinkingTime);
        
        // Select an answer
        cy.get('input[type="radio"]').then($radios => {
          // If we want to answer correctly and the correct answer is known
          if (willAnswerCorrectly) {
            // Try to find the correct answer from the solution text
            cy.get('body').then($body => {
              if ($body.find('.bg-red-50, .bg-green-50').length > 0) {
                // If solution is already showing, get the correct answer
                const correctAnswerMatch = $body.text().match(/Correct Answer: ([A-D])/);
                if (correctAnswerMatch && correctAnswerMatch[1]) {
                  const correctLetter = correctAnswerMatch[1];
                  cy.get(`input[value="${correctLetter}"]`).click();
                } else {
                  // Random answer as fallback
                  const randomRadio = Math.floor(Math.random() * $radios.length);
                  cy.wrap($radios[randomRadio]).click();
                }
              } else {
                // If solution isn't showing, pick a random answer
                const randomRadio = Math.floor(Math.random() * $radios.length);
                cy.wrap($radios[randomRadio]).click();
              }
            });
          } else {
            // Intentionally pick a wrong answer
            const randomRadio = Math.floor(Math.random() * $radios.length);
            cy.wrap($radios[randomRadio]).click();
          }
        });
        
        // Set confidence level
        cy.get('select').eq(1).select(confidenceLevel.toString());
        
        // Submit answer
        cy.contains('button', 'Submit Answer').click();
        
        // Wait for result to display
        cy.contains('✅ Correct!', { timeout: 10000 }).should('exist').then(() => {
          cy.log(`Answered ${randomTopic} question correctly`);
        }).catch(() => {
          cy.contains('❌ Incorrect!').should('exist').then(() => {
            cy.log(`Answered ${randomTopic} question incorrectly`);
          });
        });
        
        // Close alert if it appears
        cy.on('window:alert', () => true);
        cy.on('window:confirm', () => true);
        
        // Wait a moment before generating the next question
        cy.wait(2000);
      }
      
      // Finally, visit the performance page to verify data
      cy.visit('/performance');
      cy.contains('Performance Dashboard').should('be.visible');
      cy.contains('Overall Performance').should('be.visible');
      cy.screenshot('performance-dashboard');
    });
  });