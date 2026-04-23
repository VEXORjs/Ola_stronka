'use client'

import * as motion from "motion/react-client";
import InteractiveFlower from "./InteractiveFlower";

export default function Home() {
    return (
        <main style={{
            backgroundColor: '#08080c',
            minHeight: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 0,
            padding: 0,
            overflow: 'hidden'
        }}>
            {/* Kontener musi mieć zdefiniowaną wysokość i szerokość! */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 2 }}
                style={{
                    width: '100vw',
                    height: '100vh',
                    position: 'fixed'
                }}
            >
                <InteractiveFlower />
            </motion.div>
        </main>
    );
}