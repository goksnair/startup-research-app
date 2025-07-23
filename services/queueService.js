const memoryQueue = require('./memoryQueueService');

// Queue Service with Memory-First Approach
// Uses enhanced in-memory queues as primary solution
// Optional Redis support for scaling if needed

const USE_REDIS = process.env.FORCE_REDIS === 'true' && process.env.REDIS_URL;

console.log(`🔧 Queue Mode: ${USE_REDIS ? 'Redis' : 'Enhanced Memory'}`);

let Queue, redis, redisConfig;

if (USE_REDIS) {
    Queue = require('bull');
    redis = require('redis');
    
    // Redis configuration for scaling
    redisConfig = (() => {
        if (process.env.REDIS_URL) {
            return {
                redis: process.env.REDIS_URL,
                settings: {
                    maxRetriesPerRequest: 3,
                    retryDelayOnFailover: 100,
                    lazyConnect: true
                }
            };
        }
        
        return {
            redis: {
                port: process.env.REDIS_PORT || 6379,
                host: process.env.REDIS_HOST || 'localhost',
                password: process.env.REDIS_PASSWORD || undefined,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                keepAlive: 30000,
                family: 4
            }
        };
    })();
}

// Test Redis connection
const testRedisConnection = async () => {
    if (!USE_REDIS) {
        console.log('📝 Redis disabled, using enhanced memory queues');
        return false;
    }
    
    try {
        let client;
        
        // Handle Upstash Redis URL vs traditional Redis config
        if (typeof redisConfig.redis === 'string') {
            // Upstash Redis URL
            client = redis.createClient({ url: redisConfig.redis });
        } else {
            // Traditional Redis config
            client = redis.createClient(redisConfig.redis);
        }
        
        await client.connect();
        const response = await client.ping();
        console.log('✅ Redis connection successful:', response);
        await client.disconnect();
        return true;
    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        console.log('📝 Falling back to enhanced memory queues');
        return false;
    }
};

// Check if Redis is available
let redisAvailable = false;
if (USE_REDIS) {
    testRedisConnection().then(available => {
        redisAvailable = available;
    });
}

// Create job queues with fallback approach
let analysisQueue, batchQueue, emailQueue, reportQueue;

if (USE_REDIS) {
    // Use Redis-based Bull queues
    analysisQueue = new Queue('startup analysis', redisConfig);
    batchQueue = new Queue('batch processing', redisConfig);
    emailQueue = new Queue('email notifications', redisConfig);
    reportQueue = new Queue('report generation', redisConfig);
} else {
    // Use enhanced memory queues (primary solution)
    analysisQueue = {
        add: (jobType, data, options) => memoryQueue.add('analysis', jobType, data, options),
        process: (jobType, worker) => memoryQueue.process('analysis', jobType, worker),
        getJobs: (status) => memoryQueue.getJobs('analysis', status),
        waiting: () => memoryQueue.getJobs('analysis', 'waiting'),
        active: () => memoryQueue.getJobs('analysis', 'active'),
        getCompleted: () => memoryQueue.getJobs('analysis', 'completed'),
        getFailed: () => memoryQueue.getJobs('analysis', 'failed'),
        on: (event, handler) => memoryQueue.on(event, handler),
        clean: (olderThan, status) => memoryQueue.clean(olderThan)
    };
    
    batchQueue = {
        add: (jobType, data, options) => memoryQueue.add('batch', jobType, data, options),
        process: (jobType, worker) => memoryQueue.process('batch', jobType, worker),
        getJobs: (status) => memoryQueue.getJobs('batch', status),
        waiting: () => memoryQueue.getJobs('batch', 'waiting'),
        active: () => memoryQueue.getJobs('batch', 'active'),
        getCompleted: () => memoryQueue.getJobs('batch', 'completed'),
        getFailed: () => memoryQueue.getJobs('batch', 'failed'),
        on: (event, handler) => memoryQueue.on(event, handler),
        clean: (olderThan, status) => memoryQueue.clean(olderThan)
    };
    
    emailQueue = {
        add: (jobType, data, options) => memoryQueue.add('email', jobType, data, options),
        process: (jobType, worker) => memoryQueue.process('email', jobType, worker),
        on: (event, handler) => memoryQueue.on(event, handler)
    };
    
    reportQueue = {
        add: (jobType, data, options) => memoryQueue.add('report', jobType, data, options),
        process: (jobType, worker) => memoryQueue.process('report', jobType, worker),
        on: (event, handler) => memoryQueue.on(event, handler)
    };
}

// Queue monitoring and error handling
if (USE_REDIS) {
    // Redis queue event handlers
    analysisQueue.on('completed', (job, result) => {
        console.log(`✅ Analysis job ${job.id} completed for company: ${job.data.company}`);
    });

    analysisQueue.on('failed', (job, err) => {
        console.log(`❌ Analysis job ${job.id} failed: ${err.message}`);
    });

    batchQueue.on('completed', (job, result) => {
        console.log(`✅ Batch job ${job.id} completed: ${result.companiesProcessed} companies`);
    });

    batchQueue.on('failed', (job, err) => {
        console.log(`❌ Batch job ${job.id} failed: ${err.message}`);
    });

    emailQueue.on('completed', (job, result) => {
        console.log(`✅ Email sent to ${job.data.email}`);
    });

    reportQueue.on('completed', (job, result) => {
        console.log(`✅ PDF report generated: ${result.fileName}`);
    });
} else {
    // Memory queue event handlers
    memoryQueue.on('job-completed', ({ queueName, jobId, job, result }) => {
        if (queueName === 'analysis') {
            console.log(`✅ Analysis job ${jobId} completed for company: ${job.data.company}`);
        } else if (queueName === 'batch') {
            console.log(`✅ Batch job ${jobId} completed: ${result?.companiesProcessed || 'N/A'} companies`);
        } else if (queueName === 'email') {
            console.log(`✅ Email sent to ${job.data.email}`);
        } else if (queueName === 'report') {
            console.log(`✅ PDF report generated: ${result?.fileName || 'report.pdf'}`);
        }
    });

    memoryQueue.on('job-failed', ({ queueName, jobId, job, error }) => {
        console.log(`❌ ${queueName} job ${jobId} failed: ${error.message}`);
    });

    memoryQueue.on('job-progress', ({ jobId, progress }) => {
        console.log(`🔄 Job ${jobId} progress: ${progress}%`);
    });
}

// Queue statistics
const getQueueStats = async () => {
    try {
        if (USE_REDIS && redisAvailable) {
            const [analysisWaiting, analysisActive, batchWaiting, batchActive] = await Promise.all([
                analysisQueue.waiting(),
                analysisQueue.active(),
                batchQueue.waiting(),
                batchQueue.active()
            ]);

            return {
                analysis: {
                    waiting: analysisWaiting.length,
                    active: analysisActive.length
                },
                batch: {
                    waiting: batchWaiting.length,
                    active: batchActive.length
                },
                mode: 'redis',
                redis: { available: true }
            };
        } else {
            // Use memory queue statistics
            const analysisStats = memoryQueue.getStats('analysis');
            const batchStats = memoryQueue.getStats('batch');
            
            return {
                analysis: {
                    waiting: analysisStats.waiting,
                    active: analysisStats.active
                },
                batch: {
                    waiting: batchStats.waiting,
                    active: batchStats.active
                },
                mode: 'memory',
                memory: { 
                    available: true,
                    totalStats: memoryQueue.getStats()
                }
            };
        }
    } catch (error) {
        console.error('❌ Error getting queue stats:', error);
        return {
            analysis: { waiting: 0, active: 0 },
            batch: { waiting: 0, active: 0 },
            mode: 'error',
            error: error.message
        };
    }
};

// Get detailed queue information
const getQueueDetails = async () => {
    try {
        if (!redisAvailable) {
            return { error: 'Redis not available' };
        }

        const [
            analysisCompleted,
            analysisFailed,
            batchCompleted,
            batchFailed
        ] = await Promise.all([
            analysisQueue.getCompleted(),
            analysisQueue.getFailed(),
            batchQueue.getCompleted(),
            batchQueue.getFailed()
        ]);

        return {
            analysis: {
                completed: analysisCompleted.length,
                failed: analysisFailed.length
            },
            batch: {
                completed: batchCompleted.length,
                failed: batchFailed.length
            }
        };
    } catch (error) {
        console.error('❌ Error getting queue details:', error);
        return { error: error.message };
    }
};

// Clean completed jobs periodically
const cleanupJobs = async () => {
    try {
        await analysisQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
        await batchQueue.clean(24 * 60 * 60 * 1000, 'completed');
        await emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed'); // 7 days
        await reportQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
        console.log('✅ Queue cleanup completed');
    } catch (error) {
        console.error('❌ Queue cleanup failed:', error);
    }
};

// Run cleanup every hour
setInterval(cleanupJobs, 60 * 60 * 1000);

module.exports = {
    analysisQueue,
    batchQueue,
    emailQueue,
    reportQueue,
    getQueueStats,
    getQueueDetails,
    redisAvailable: () => USE_REDIS ? redisAvailable : false,
    memoryQueueAvailable: () => !USE_REDIS,
    testRedisConnection,
    memoryQueue: USE_REDIS ? null : memoryQueue
};
