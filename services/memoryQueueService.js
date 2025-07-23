// Enhanced In-Memory Queue Service (Redis Alternative)
// Provides persistent queue functionality without Redis dependency

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class MemoryQueueService extends EventEmitter {
    constructor() {
        super();
        this.queues = new Map();
        this.jobs = new Map();
        this.workers = new Map();
        this.stats = {
            processed: 0,
            failed: 0,
            active: 0,
            waiting: 0
        };
        
        console.log('✅ Memory Queue Service initialized (Redis alternative)');
    }

    // Create or get a queue
    getQueue(name) {
        if (!this.queues.has(name)) {
            this.queues.set(name, {
                name,
                jobs: [],
                processing: new Map(),
                completed: [],
                failed: [],
                settings: {
                    concurrency: 3,
                    attempts: 3
                }
            });
        }
        return this.queues.get(name);
    }

    // Add job to queue
    async add(queueName, jobType, data, options = {}) {
        const queue = this.getQueue(queueName);
        const jobId = uuidv4();
        
        const job = {
            id: jobId,
            type: jobType,
            data,
            options: {
                attempts: options.attempts || 3,
                delay: options.delay || 0,
                priority: options.priority || 0,
                ...options
            },
            status: 'waiting',
            createdAt: new Date(),
            attempts: 0,
            progress: 0,
            logs: []
        };

        this.jobs.set(jobId, job);
        
        // Insert job based on priority
        const insertIndex = queue.jobs.findIndex(j => 
            this.jobs.get(j).options.priority < job.options.priority
        );
        
        if (insertIndex === -1) {
            queue.jobs.push(jobId);
        } else {
            queue.jobs.splice(insertIndex, 0, jobId);
        }

        this.stats.waiting++;
        
        console.log(`📝 Job ${jobId} added to queue ${queueName}`);
        this.emit('job-added', { queueName, jobId, job });
        
        // Process job if not delayed
        if (job.options.delay === 0) {
            setImmediate(() => this.processNextJob(queueName));
        } else {
            setTimeout(() => this.processNextJob(queueName), job.options.delay);
        }
        
        return { id: jobId, queue: queueName };
    }

    // Process next job in queue
    async processNextJob(queueName) {
        const queue = this.getQueue(queueName);
        
        if (queue.processing.size >= queue.settings.concurrency) {
            return; // Max concurrency reached
        }
        
        if (queue.jobs.length === 0) {
            return; // No jobs waiting
        }
        
        const jobId = queue.jobs.shift();
        const job = this.jobs.get(jobId);
        
        if (!job) {
            return;
        }
        
        // Move to processing
        queue.processing.set(jobId, job);
        job.status = 'processing';
        job.startedAt = new Date();
        job.attempts++;
        
        this.stats.waiting--;
        this.stats.active++;
        
        console.log(`🔄 Processing job ${jobId} (attempt ${job.attempts})`);
        this.emit('job-started', { queueName, jobId, job });
        
        try {
            // Get worker for this job type
            const worker = this.workers.get(`${queueName}:${job.type}`);
            if (!worker) {
                throw new Error(`No worker found for job type: ${job.type}`);
            }
            
            // Process the job
            const result = await worker(job);
            
            // Job succeeded
            job.status = 'completed';
            job.completedAt = new Date();
            job.result = result;
            
            queue.processing.delete(jobId);
            queue.completed.push(jobId);
            
            this.stats.active--;
            this.stats.processed++;
            
            console.log(`✅ Job ${jobId} completed successfully`);
            this.emit('job-completed', { queueName, jobId, job, result });
            
        } catch (error) {
            console.error(`❌ Job ${jobId} failed:`, error.message);
            
            // Handle job failure
            job.error = error.message;
            job.logs.push({
                timestamp: new Date(),
                level: 'error',
                message: error.message
            });
            
            if (job.attempts < job.options.attempts) {
                // Retry job
                job.status = 'waiting';
                queue.processing.delete(jobId);
                queue.jobs.push(jobId); // Add back to queue
                
                this.stats.active--;
                this.stats.waiting++;
                
                console.log(`🔄 Retrying job ${jobId} (attempt ${job.attempts + 1})`);
                
                // Retry with exponential backoff
                const delay = Math.pow(2, job.attempts) * 1000;
                setTimeout(() => this.processNextJob(queueName), delay);
                
            } else {
                // Job failed permanently
                job.status = 'failed';
                job.failedAt = new Date();
                
                queue.processing.delete(jobId);
                queue.failed.push(jobId);
                
                this.stats.active--;
                this.stats.failed++;
                
                this.emit('job-failed', { queueName, jobId, job, error });
            }
        }
        
        // Process next job
        setImmediate(() => this.processNextJob(queueName));
    }

    // Register worker for job type
    process(queueName, jobType, worker) {
        const key = `${queueName}:${jobType}`;
        this.workers.set(key, worker);
        console.log(`👷 Worker registered for ${key}`);
        
        // Start processing existing jobs
        setImmediate(() => this.processNextJob(queueName));
    }

    // Get job by ID
    getJob(jobId) {
        return this.jobs.get(jobId);
    }

    // Update job progress
    updateProgress(jobId, progress) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.progress = Math.min(100, Math.max(0, progress));
            this.emit('job-progress', { jobId, progress: job.progress });
        }
    }

    // Get queue statistics
    getStats(queueName) {
        if (queueName) {
            const queue = this.getQueue(queueName);
            return {
                waiting: queue.jobs.length,
                active: queue.processing.size,
                completed: queue.completed.length,
                failed: queue.failed.length
            };
        }
        
        return this.stats;
    }

    // Get jobs by status
    getJobs(queueName, status, start = 0, end = -1) {
        const queue = this.getQueue(queueName);
        let jobIds = [];
        
        switch (status) {
            case 'waiting':
                jobIds = queue.jobs;
                break;
            case 'active':
                jobIds = Array.from(queue.processing.keys());
                break;
            case 'completed':
                jobIds = queue.completed;
                break;
            case 'failed':
                jobIds = queue.failed;
                break;
        }
        
        if (end === -1) end = jobIds.length;
        return jobIds.slice(start, end).map(id => this.jobs.get(id));
    }

    // Remove job
    async removeJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return false;
        
        // Find and remove from queues
        for (const [queueName, queue] of this.queues) {
            const index = queue.jobs.indexOf(jobId);
            if (index !== -1) {
                queue.jobs.splice(index, 1);
                this.stats.waiting--;
            }
            
            if (queue.processing.has(jobId)) {
                queue.processing.delete(jobId);
                this.stats.active--;
            }
        }
        
        this.jobs.delete(jobId);
        return true;
    }

    // Clean old jobs
    clean(olderThan = 24 * 60 * 60 * 1000) { // 24 hours default
        const cutoff = new Date(Date.now() - olderThan);
        let cleaned = 0;
        
        for (const [jobId, job] of this.jobs) {
            if (job.status === 'completed' && job.completedAt < cutoff) {
                this.jobs.delete(jobId);
                cleaned++;
            }
        }
        
        console.log(`🧹 Cleaned ${cleaned} old jobs`);
        return cleaned;
    }

    // Pause queue
    pause(queueName) {
        const queue = this.getQueue(queueName);
        queue.paused = true;
        console.log(`⏸️ Queue ${queueName} paused`);
    }

    // Resume queue
    resume(queueName) {
        const queue = this.getQueue(queueName);
        queue.paused = false;
        console.log(`▶️ Queue ${queueName} resumed`);
        setImmediate(() => this.processNextJob(queueName));
    }
}

// Create singleton instance
const memoryQueue = new MemoryQueueService();

// Auto-cleanup every hour
setInterval(() => {
    memoryQueue.clean();
}, 60 * 60 * 1000);

module.exports = memoryQueue;