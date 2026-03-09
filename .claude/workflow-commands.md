# Compound Engineering Workflow

## Komut Sıralaması

```
/plan → /work → /review → /compound → /deploy
```

Veya tek seferde: `/lfg`

## Komutlar

| # | Komut | Açıklama | Ne Zaman |
|---|-------|----------|----------|
| 1 | `/plan` | Detaylı implementasyon planı oluştur | Yeni özellik/fix başlarken |
| 2 | `/work` | Onaylanan planı uygula | Plan onaylandıktan sonra |
| 3 | `/review` | 6 perspektifli kod inceleme | Kod yazıldıktan sonra |
| 4 | `/compound` | Öğrenilenleri dokümante et | Review tamamlandıktan sonra |
| 5 | `/deploy` | Commit ve push | Her şey hazır olduğunda |

## Kısa Açıklamalar

### `/plan`
- CLAUDE.md ve mevcut kodu oku
- `.claude/solutions/` içinde benzer çözümleri ara
- `.claude/plans/YYYY-MM-DD-<feature>.md` oluştur
- Onay bekle

### `/work`
- Planı adım adım uygula
- Her adımda TypeScript derlemesini kontrol et
- TodoWrite ile ilerlemeyi takip et

### `/review`
6 perspektif:
1. **Security** - Auth, input validation, secrets
2. **Architecture** - Servis yapısı, modülerlik
3. **Data Integrity** - Storage, revocation
4. **TypeScript** - Strict mode, typing
5. **Performance** - N+1, async
6. **Simplicity** - YAGNI, over-engineering

Bulgular: P1 (kritik), P2 (önemli), P3 (minör)

### `/compound`
- Öğrenilenleri `.claude/solutions/` içine kaydet
- CLAUDE.md'ye lesson learned ekle
- `.claude/progress.md` güncelle

### `/deploy`
- `git status` kontrol
- Dosyaları explicit stage et (asla `git add .`)
- Conventional Commits formatında mesaj
- `git push origin main`

### `/lfg`
Tüm adımları sırayla çalıştır - tam döngü.

## Klasör Yapısı

```
.claude/
├── commands/           # Bu workflow komutları
├── plans/              # İmplementasyon planları
├── solutions/          # Çözüm dokümantasyonu
├── todos/              # Görevler
├── progress.md         # İlerleme takibi
└── workflow-commands.md # Bu dosya
```

## Kurallar

1. **Plan onayı olmadan kod yazma**
2. **P1 bulguları düzeltmeden deploy etme**
3. **Compound fazını atlama** - her döngüde öğrenilenleri kaydet
4. **Secrets commit etme** - .env, API keys
5. **Force push yapma** - main branch'e
