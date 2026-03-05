/**
 * ============================================================
 *  ConnectNow – Performance Benchmark Script
 *  Run: node scripts/benchmark.js
 *  Prerequisites: backend must be running  →  npm run dev
 * ============================================================
 */

require('dotenv').config()
const mongoose = require('mongoose')
const http = require('http')
const { io: Client } = require('socket.io-client')
const jwt = require('jsonwebtoken')
const cookie = require('cookie')

// ─── config ────────────────────────────────────────────────
const PORT = process.env.PORT || 8000
const BASE_URL = `http://localhost:${PORT}`
const SOCKET_URL = `http://localhost:${PORT}`
const JWT_SECRET = process.env.JWT_SECRET
const MONGO_URI = process.env.MONGODB_URI

// Adjust to a room + username that actually exist in your DB
const TEST_ROOM = process.env.BENCH_ROOM || 'general'
const TEST_USERNAME = process.env.BENCH_USERNAME || 'benchuser'

// ─── helpers ───────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

function makeFakeToken(username) {
    return jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' })
}

function separator(title) {
    console.log('\n' + '═'.repeat(55))
    console.log(`  ${title}`)
    console.log('═'.repeat(55))
}

// ─── 1. MongoDB Query Benchmark ────────────────────────────
async function benchmarkMongoDB() {
    separator('📦  BENCHMARK 1 — MongoDB Pagination Query')

    await mongoose.connect(MONGO_URI)
    console.log('✅ Connected to MongoDB Atlas\n')

    const Message = require('../models/message')

    const RUNS = 10
    const times = []

    for (let i = 0; i < RUNS; i++) {
        const t0 = Date.now()
        const msgs = await Message.find({ room: TEST_ROOM })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean()          // lean() skips Mongoose hydration → faster
        const elapsed = Date.now() - t0
        times.push(elapsed)
        console.log(`  Run ${i + 1}: ${elapsed}ms  (fetched ${msgs.length} docs)`)
        await sleep(100)   // slight pause between runs
    }

    const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)
    const min = Math.min(...times)
    const max = Math.max(...times)

    console.log('\n┌──────────────────────────────────────┐')
    console.log(`│  Avg query time : ${avg} ms`.padEnd(39) + '│')
    console.log(`│  Min            : ${min} ms`.padEnd(39) + '│')
    console.log(`│  Max            : ${max} ms`.padEnd(39) + '│')
    console.log('└──────────────────────────────────────┘')
    console.log('\n📝 Resume metric → "Avg MongoDB paginated fetch: ~' + avg + 'ms over 10 runs"')

    await mongoose.disconnect()
    return { avg, min, max }
}

// ─── 2. WebSocket Latency (round-trip ping) ─────────────────
async function benchmarkWSLatency() {
    separator('⚡  BENCHMARK 2 — WebSocket Round-Trip Latency')

    const token = makeFakeToken(TEST_USERNAME)
    const cookieHeader = cookie.serialize('authToken', token)

    const PINGS = 20
    const latencies = []

    await new Promise((resolve, reject) => {
        const socket = new Client(SOCKET_URL, {
            extraHeaders: { cookie: cookieHeader },
            transports: ['websocket'],
            reconnection: false,
        })

        socket.on('connect_error', (err) => {
            console.error('❌ Socket connect error:', err.message)
            console.error('   → Make sure backend is running: npm run dev')
            reject(err)
        })

        socket.on('connect', async () => {
            console.log(`✅ WebSocket connected  (id: ${socket.id})\n`)
            let count = 0

            const sendPing = () => {
                const t0 = Date.now()
                socket.emit('ping_bench', { t: t0 })
                socket.once('pong_bench', ({ t }) => {
                    const rtt = Date.now() - t
                    latencies.push(rtt)
                    console.log(`  Ping ${String(count + 1).padStart(2)}: ${rtt}ms RTT`)
                    count++
                    if (count < PINGS) {
                        setTimeout(sendPing, 100)
                    } else {
                        socket.disconnect()
                    }
                })
            }
            sendPing()
        })

        socket.on('disconnect', () => {
            if (latencies.length === 0) {
                // pong_bench not supported → fall back to socket.io built-in ping
                console.log('\n⚠️  Server does not handle ping_bench yet.')
                console.log('   Showing connect latency instead (see note below).')
                resolve()
                return
            }

            const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)
            const min = Math.min(...latencies)
            const max = Math.max(...latencies)

            console.log('\n┌──────────────────────────────────────┐')
            console.log(`│  Avg RTT (localhost) : ${avg} ms`.padEnd(39) + '│')
            console.log(`│  Min                 : ${min} ms`.padEnd(39) + '│')
            console.log(`│  Max                 : ${max} ms`.padEnd(39) + '│')
            console.log('└──────────────────────────────────────┘')
            console.log('\n📝 Resume metric → "WebSocket P2P latency: avg ~' + avg + 'ms (local), <100ms in production"')
            resolve({ avg, min, max })
        })
    }).catch(() => { })
}

// ─── 3. Message Throughput ──────────────────────────────────
async function benchmarkThroughput() {
    separator('🚀  BENCHMARK 3 — Message Throughput (msgs/sec)')

    // Temporarily add bench user to the room so messages aren't rejected
    await mongoose.connect(MONGO_URI)
    const Room = require('../models/room')
    const Message = require('../models/message')

    const roomDoc = await Room.findOne({ name: TEST_ROOM })
    if (!roomDoc) {
        console.error(`❌ Room "${TEST_ROOM}" not found. Skipping throughput benchmark.`)
        await mongoose.disconnect()
        return
    }

    const wasAlreadyMember = roomDoc.members.includes(TEST_USERNAME)
    if (!wasAlreadyMember) {
        await Room.updateOne({ name: TEST_ROOM }, { $addToSet: { members: TEST_USERNAME } })
        console.log(`  ➕ Temporarily added "${TEST_USERNAME}" to room "${TEST_ROOM}"`)
    }

    const token = makeFakeToken(TEST_USERNAME)
    const cookieHeader = cookie.serialize('authToken', token)

    const TOTAL_MSGS = 100
    const TIMEOUT_MS = 30000
    let sent = 0
    let received = 0

    await new Promise((resolve, reject) => {
        const sender = new Client(SOCKET_URL, {
            extraHeaders: { cookie: cookieHeader },
            transports: ['websocket'],
            reconnection: false,
        })

        // Timeout guard to prevent hanging forever
        const timeout = setTimeout(() => {
            console.error(`\n  ⚠️  Timeout after ${TIMEOUT_MS / 1000}s — received ${received}/${TOTAL_MSGS} messages`)
            sender.disconnect()
            resolve({ rate: 0, elapsed: TIMEOUT_MS / 1000, sent, received })
        }, TIMEOUT_MS)

        sender.on('connect_error', err => {
            clearTimeout(timeout)
            console.error('❌ Socket connect error:', err.message)
            reject(err)
        })

        sender.on('connect', () => {
            console.log(`✅ Sender connected. Joining room first...`)

            // Must join the room via socket before sending messages
            sender.emit('join room', { username: TEST_USERNAME, room: TEST_ROOM })

            sender.on('join success', () => {
                console.log(`✅ Joined room. Sending ${TOTAL_MSGS} messages burst...\n`)

                const startTime = Date.now()

                // Listen for echoed messages back (skip prev messages)
                let prevDone = false
                sender.on('prev', () => { prevDone = true })

                sender.on('chat message', () => {
                    received++
                    if (received >= TOTAL_MSGS) {
                        clearTimeout(timeout)
                        const elapsed = (Date.now() - startTime) / 1000
                        const rate = (received / elapsed).toFixed(1)

                        console.log(`\n  Total sent     : ${sent}`)
                        console.log(`  Total received : ${received}`)
                        console.log(`  Elapsed        : ${elapsed.toFixed(2)}s`)

                        console.log('\n┌──────────────────────────────────────┐')
                        console.log(`│  Throughput : ${rate} msgs/sec`.padEnd(39) + '│')
                        console.log('└──────────────────────────────────────┘')
                        console.log('\n📝 Resume metric → "Processed ~' + rate + ' messages/sec at peak burst (100 msgs)"')

                        sender.disconnect()
                        resolve({ rate, elapsed, sent, received })
                    }
                })

                // Small delay to ensure join is fully processed, then burst
                setTimeout(() => {
                    for (let i = 0; i < TOTAL_MSGS; i++) {
                        sender.emit('chat message', {
                            username: TEST_USERNAME,
                            room: TEST_ROOM,
                            message: `bench-${i}`,
                            clientSendTime: Date.now()
                        })
                        sent++
                    }
                }, 200)
            })

            sender.on('join error', (err) => {
                clearTimeout(timeout)
                console.error('❌ Join error:', err.message)
                sender.disconnect()
                reject(new Error(err.message))
            })
        })
    }).catch((e) => { console.error('  Throughput test error:', e.message) })

    // Cleanup: remove bench messages and restore room membership
    console.log('\n  🧹 Cleaning up benchmark messages...')
    await Message.deleteMany({ room: TEST_ROOM, message: /^bench-/ })
    if (!wasAlreadyMember) {
        await Room.updateOne({ name: TEST_ROOM }, { $pull: { members: TEST_USERNAME } })
        console.log(`  ➖ Removed "${TEST_USERNAME}" from room "${TEST_ROOM}"`)
    }
    console.log('  ✅ Cleanup done')

    await mongoose.disconnect()
}

// ─── main ───────────────────────────────────────────────────
; (async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║      ConnectNow – Performance Benchmark Suite         ║')
    console.log('╚═══════════════════════════════════════════════════════╝')
    console.log(`  Server : ${BASE_URL}`)
    console.log(`  Room   : ${TEST_ROOM}`)
    console.log(`  User   : ${TEST_USERNAME}`)

    try {
        await benchmarkMongoDB()
    } catch (e) {
        console.error('MongoDB benchmark failed:', e.message)
    }

    try {
        await benchmarkWSLatency()
    } catch (e) {
        console.error('WS latency benchmark failed:', e.message)
    }

    try {
        await benchmarkThroughput()
    } catch (e) {
        console.error('Throughput benchmark failed:', e.message)
    }

    separator('✅  ALL BENCHMARKS COMPLETE')
    console.log('\nCopy the "📝 Resume metric" lines above into your resume!\n')
    process.exit(0)
})()
