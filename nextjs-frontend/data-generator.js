// A simpler, more robust data generator script

const puppeteer = require('puppeteer');

// Configuration
const config = {
  baseUrl: 'http://localhost:3000',
  email: 'test@example.com',
  password: 'password123',
  totalQuestions: 30,
  topics: ['Algebra', 'Geometry', 'Grammar', 'Reading Comprehension', 'Trigonometry'],
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateData() {
  console.log('Starting data generation...');
  
  // Launch browser with debugging enabled
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
    // Slow down operations to see what's happening
    slowMo: 50
  });
  
  const page = await browser.newPage();
  
  // Enable console logging from the page
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  try {
    // Login
    console.log('Navigating to auth page...');
    await page.goto(`${config.baseUrl}/auth`);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    console.log('Entering login credentials...');
    await page.type('input[type="email"]', config.email);
    await page.type('input[type="password"]', config.password);
    
    // Take screenshot of login page to debug
    await page.screenshot({ path: 'login-page.png' });
    
    // Find and log all buttons on the page
    const buttonTexts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(button => button.textContent.trim());
    });
    console.log('Buttons found on page:', buttonTexts);
    
    // Click the first button (assuming it's the login button)
    console.log('Clicking on first button (login)...');
    await Promise.all([
      page.click('button'), 
      page.waitForNavigation({ timeout: 30000 })
    ]);
    
    console.log('Navigation complete, checking if logged in...');
    
    // Check if we're on the dashboard page
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    if (currentUrl.includes('/dashboard')) {
      console.log('Successfully logged in!');
    } else {
      throw new Error('Login failed: Not redirected to dashboard');
    }
    
    // Take screenshot of dashboard
    await page.screenshot({ path: 'dashboard.png' });
    
    // Generate a few questions to test
    for (let i = 0; i < 5; i++) {
      console.log(`\nGenerating test question ${i + 1} of 5...`);
      
      // Select a topic
      const topic = config.topics[i % config.topics.length];
      console.log(`Selecting topic: ${topic}`);
      
      // Wait for selects to be available and get their count
      await page.waitForSelector('select');
      const selectCount = await page.evaluate(() => document.querySelectorAll('select').length);
      console.log(`Number of select elements found: ${selectCount}`);
      
      // Select the topic from the first dropdown
      await page.select('select', topic);
      console.log(`Topic ${topic} selected`);
      
      // Find all buttons and log them
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(button => ({
          text: button.textContent.trim(),
          type: button.type,
          disabled: button.disabled,
          className: button.className
        }));
      });
      console.log('Available buttons:', JSON.stringify(allButtons, null, 2));
      
      // Find the generate button by matching "Generate Question" text
      const generateButtonIndex = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.findIndex(button => 
          button.textContent.includes('Generate Question')
        );
      });
      
      if (generateButtonIndex === -1) {
        console.log('Cannot find "Generate Question" button, taking screenshot...');
        await page.screenshot({ path: `missing-generate-button-${i}.png` });
        continue;
      }
      
      console.log(`Found "Generate Question" button at index ${generateButtonIndex}`);
      
      // Click the generate button and wait for response
      console.log('Clicking "Generate Question" button...');
      
      try {
        // Use JavaScript click to be more reliable
        await page.evaluate((index) => {
          document.querySelectorAll('button')[index].click();
        }, generateButtonIndex);
        
        // Wait for question to appear
        console.log('Waiting for question to load...');
        await page.waitForFunction(
          () => document.querySelector('.bg-gray-50') !== null,
          { timeout: 30000 }
        );
        
        console.log('Question loaded successfully');
        await page.screenshot({ path: `question-${i}.png` });
        
        // Check for radio buttons (answer choices)
        const radioCount = await page.evaluate(() => 
          document.querySelectorAll('input[type="radio"]').length
        );
        
        console.log(`Found ${radioCount} answer choices`);
        
        if (radioCount > 0) {
          // Select a random answer
          const randomAnswerIndex = Math.floor(Math.random() * radioCount);
          console.log(`Selecting answer choice ${randomAnswerIndex + 1}`);
          
          await page.evaluate((index) => {
            document.querySelectorAll('input[type="radio"]')[index].click();
          }, randomAnswerIndex);
          
          // Set confidence
          if (selectCount > 1) {
            console.log('Setting confidence level to 3');
            await page.select('select:nth-of-type(2)', '3');
          }
          
          // Find the submit button
          const submitButtonIndex = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.findIndex(button => 
              button.textContent.includes('Submit Answer')
            );
          });
          
          if (submitButtonIndex !== -1) {
            console.log('Clicking "Submit Answer" button');
            await page.evaluate((index) => {
              document.querySelectorAll('button')[index].click();
            }, submitButtonIndex);
            
            // Handle alert if it appears
            page.on('dialog', async dialog => {
              console.log(`Dialog appeared: ${dialog.message()}`);
              await dialog.accept();
            });
            
            // Wait for result
            await sleep(3000);
            console.log('Answer submitted');
            await page.screenshot({ path: `result-${i}.png` });
          } else {
            console.log('Submit Answer button not found');
          }
        } else {
          console.log('No answer choices found for this question');
        }
      } catch (error) {
        console.error(`Error during question ${i + 1}:`, error);
        await page.screenshot({ path: `error-state-${i}.png` });
      }
      
      // Wait before next question
      await sleep(5000);
    }
    
    // Visit the performance page
    console.log('\nNavigating to performance page...');
    await page.goto(`${config.baseUrl}/performance`, { waitUntil: 'networkidle0' });
    await sleep(3000);
    
    console.log('Taking screenshot of performance page...');
    await page.screenshot({ path: 'performance-page.png', fullPage: true });
    
    console.log('\nData generation test completed!');
    
  } catch (error) {
    console.error('\nError during data generation:', error);
    await page.screenshot({ path: 'error-state.png' });
  } finally {
    // Wait a moment before closing
    await sleep(5000);
    await browser.close();
    console.log('Browser closed');
  }
}

// Run the script
(async () => {
  try {
    await generateData();
  } catch (error) {
    console.error('Script execution failed:', error);
  }
})();