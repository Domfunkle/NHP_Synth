// errorHandler.js - Centralized error handling and logging

export class ErrorHandler {
    constructor() {
        this.setupGlobalErrorHandling();
    }

    // Setup global error handlers
    setupGlobalErrorHandling() {
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.logError('Network or API error occurred', 'error');
            event.preventDefault();
        });

        // Handle JavaScript errors
        window.addEventListener('error', (event) => {
            console.error('JavaScript error:', event.error);
            this.logError('Application error occurred', 'error');
        });
    }

    // Log error to console
    logError(message, type = 'warning') {
        const prefix = type === 'error' ? '[ERROR]' : '[WARNING]';
        console.warn(`${prefix} ${message}`);
    }

    // Log success to console
    logSuccess(message) {
        console.log(`[SUCCESS] ${message}`);
    }

    // Wrap async functions with error handling
    async safeExecute(fn, errorMessage = 'Operation failed') {
        try {
            return await fn();
        } catch (error) {
            console.error(errorMessage, error);
            this.logError(errorMessage);
            throw error;
        }
    }

    // Wrap render functions with error boundaries
    safeRender(fn, fallbackContent = '<div class="alert alert-danger">Rendering failed</div>') {
        try {
            return fn();
        } catch (error) {
            console.error('Render error:', error);
            this.logError('UI rendering failed');
            return fallbackContent;
        }
    }
}

// Create global error handler instance
export const errorHandler = new ErrorHandler();
