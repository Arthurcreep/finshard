// src/components/IntroScene.jsx
import React from 'react'
import s from '../styles/IntroScene.module.css'

export default function IntroScene() {
    return (
        <div className={s.scene}>
            <video
                className={s.video}
                autoPlay
                muted
                loop
                playsInline
            >
                <source src="/video/your-animation.mp4" type="video/mp4" />
                Ваш браузер не поддерживает видео.
            </video>

            <div className={s.overlay} />
        </div>
    )
}
