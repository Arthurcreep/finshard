import { useMemo, useState } from 'react';
import s from '../styles/IndicatorPopover.module.css';
import { useTranslation } from 'react-i18next';

// Мета-описание типовIndicatorPopover.module.css
const TYPES_META = {
    SMA: { hasPeriod: true, min: 1, max: 10000, defaultPeriod: 20 },
    EMA: { hasPeriod: true, min: 1, max: 10000, defaultPeriod: 20 },
    RSI: { hasPeriod: true, min: 2, max: 200, defaultPeriod: 14 },
    MACD: { hasPeriod: false },
    BB: { hasPeriod: true, min: 2, max: 400, defaultPeriod: 20 },
    VWAP: { hasPeriod: false },
};

function getDef(type) {
    const id = String(type || '').toUpperCase();
    return TYPES_META[id] ? { id, ...TYPES_META[id] } : { id: 'SMA', ...TYPES_META.SMA };
}

function typeLabel(id, t) {
    const key = String(id || '').toLowerCase();
    return t(`ind.types.${key}`);
}

export default function IndicatorPopover({ indicators, onAdd, onUpdate, onRemove }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [newType, setNewType] = useState('SMA');
    const [newPeriod, setNewPeriod] = useState(TYPES_META.SMA.defaultPeriod);
    const [newColor, setNewColor] = useState('#22c55e');
    const isHexColor = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v).trim());

    const canAdd = useMemo(() => {
        const def = getDef(newType);
        if (!def) return false;
        if (def.hasPeriod) {
            const p = Number(newPeriod);
            const isValid = Number.isFinite(p) && p >= (def.min || 1) && p <= (def.max || 10000);
            if (!isValid) return false;
        }
        return isHexColor(newColor);
    }, [newType, newPeriod, newColor]);

    const handleAdd = (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (!canAdd) return;
        const id = 'i' + Math.random().toString(36).slice(2, 9);
        const def = getDef(newType);
        const newIndicator = {
            id,
            type: def.id,
            period: def.hasPeriod ? Number(newPeriod) : undefined,
            color: newColor,
            enabled: true,
        };
        onAdd?.(newIndicator);
        setOpen(false);
        setNewType('SMA');
        setNewPeriod(TYPES_META.SMA.defaultPeriod);
        setNewColor('#22c55e');
    };

    const handleTriggerClick = () => setOpen(v => !v);
    const handleKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };

    const handleTypeChange = (ind, nextType) => {
        const def = getDef(nextType);
        const patch = { type: def.id };
        if (def.hasPeriod) {
            const cur = Number(ind.period) || def.defaultPeriod || 20;
            const min = def.min || 1;
            const max = def.max || 10000;
            patch.period = Math.min(max, Math.max(min, cur));
        } else {
            patch.period = undefined;
        }
        onUpdate?.(ind.id, patch);
    };

    const handlePeriodChange = (ind, val) => {
        const def = getDef(ind.type);
        const num = Math.max(def.min || 1, Math.min(def.max || 10000, Number(val) || 1));
        onUpdate?.(ind.id, { period: num });
    };

    const handleRemove = (id) => onRemove?.(id);

    const TYPE_IDS = Object.keys(TYPES_META);

    return (
        <div className={s.wrap}>
            <button className={s.trigger} onClick={handleTriggerClick} aria-expanded={open}>
                {t('ind.title')}
                <span className={s.count}>{(indicators || []).filter(i => i.enabled).length}</span>
            </button>

            {open && (
                <div className={s.pop} role="dialog" aria-label={t('ind.dialogTitle')} onKeyDown={handleKeyDown}>
                    <div className={s.list} role="list">
                        {(indicators || []).map(ind => {
                            const def = getDef(ind.type);
                            return (
                                <div key={ind.id} className={s.row} role="listitem">
                                    <label className={s.checkbox}>
                                        <input
                                            type="checkbox"
                                            checked={!!ind.enabled}
                                            onChange={e => onUpdate?.(ind.id, { enabled: !!e.target.checked })}
                                        />
                                    </label>

                                    <select
                                        className={s.select}
                                        value={String(ind.type || '').toUpperCase()}
                                        onChange={e => handleTypeChange(ind, e.target.value)}
                                        aria-label={t('ind.type')}
                                    >
                                        {TYPE_IDS.map(id => (
                                            <option key={id} value={id}>{typeLabel(id, t)}</option>
                                        ))}
                                    </select>

                                    {def.hasPeriod && (
                                        <input
                                            className={s.period}
                                            type="number"
                                            min={def.min || 1}
                                            max={def.max || 10000}
                                            step="1"
                                            value={ind.period ?? (def.defaultPeriod || 20)}
                                            onChange={e => handlePeriodChange(ind, e.target.value)}
                                            aria-label={t('ind.period')}
                                        />
                                    )}

                                    <input
                                        className={s.color}
                                        type="color"
                                        value={ind.color || '#22c55e'}
                                        onChange={e => onUpdate?.(ind.id, { color: e.target.value })}
                                        aria-label={t('ind.color')}
                                        title={t('ind.color')}
                                    />

                                    <button
                                        className={s.del}
                                        onClick={() => handleRemove(ind.id)}
                                        aria-label={t('ind.remove')}
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <form className={s.addBlock} onSubmit={handleAdd}>
                        <select
                            className={s.select}
                            value={newType}
                            onChange={e => {
                                const newDef = getDef(e.target.value);
                                setNewType(e.target.value);
                                setNewPeriod(newDef.defaultPeriod || 20);
                            }}
                            aria-label={t('ind.type')}
                        >
                            {TYPE_IDS.map(id => (
                                <option key={id} value={id}>{typeLabel(id, t)}</option>
                            ))}
                        </select>

                        {getDef(newType).hasPeriod && (
                            <input
                                className={s.period}
                                type="number"
                                min={getDef(newType).min || 1}
                                max={getDef(newType).max || 10000}
                                step="1"
                                value={newPeriod}
                                onChange={e => setNewPeriod(e.target.value)}
                                aria-label={t('ind.period')}
                            />
                        )}

                        <input
                            className={s.color}
                            type="color"
                            value={newColor}
                            onChange={e => setNewColor(e.target.value)}
                            aria-label={t('ind.color')}
                            title={t('ind.color')}
                        />

                        <button
                            className={`${s.addBtn} ${canAdd ? s.addBtnPrimary : s.addBtnDisabled}`}
                            disabled={!canAdd}
                            type="submit"
                            aria-disabled={!canAdd}
                            title={canAdd ? t('ind.add') : t('ind.invalid')}
                        >
                            <span className={s.plus} aria-hidden>＋</span>
                            {t('ind.add')}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
