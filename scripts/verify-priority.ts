
import { createQueueManager } from '../packages/shared/src/queue/queue-manager';

async function verifyPriority() {
    console.log('🚀 Verifying Priority Queue Logic...');
    const queueManager = createQueueManager();

    try {
        // Add a High Priority Job
        const highJob = await queueManager.addJob('scrape', { url: 'http://high-priority.com' }, { priority: 10 });
        console.log(`✅ High Priority Job Added: ${highJob.id} (Priority: ${highJob.opts.priority})`);

        if (highJob.opts.priority !== 10) {
            throw new Error('High priority not set correctly');
        }

        // Add a Low Priority Job
        const lowJob = await queueManager.addJob('scrape', { url: 'http://low-priority.com' }, { priority: 100 });
        console.log(`✅ Low Priority Job Added: ${lowJob.id} (Priority: ${lowJob.opts.priority})`);

        if (lowJob.opts.priority !== 100) {
            throw new Error('Low priority not set correctly');
        }

        console.log('🎉 Priority Verification Successful');
        process.exit(0);
    } catch (error) {
        console.error('❌ Verification Failed:', error);
        process.exit(1);
    }
}

verifyPriority();
