import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_small_tile(logo_img, out_path):
    width, height = 440, 280
    im = Image.new('RGBA', (width, height), (15, 23, 42, 255)) # #0f172a
    draw = ImageDraw.Draw(im)

    # Ambient radial gradient in center-left
    glow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-50, -20, 260, 290), fill=(37, 99, 235, 60)) # blue glow
    glow_draw.ellipse((220, 100, 480, 320), fill=(16, 185, 129, 35)) # emerald glow
    glow = glow.filter(ImageFilter.GaussianBlur(35))
    im = Image.alpha_composite(im, glow)
    draw = ImageDraw.Draw(im)

    # Subtle tech border
    draw.rounded_rectangle((2, 2, width - 3, height - 3), radius=12, outline=(59, 130, 246, 80), width=1)

    # Paste Logo on left
    logo_size = 140
    logo_thumb = logo_img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    # Rounded mask for logo
    mask = Image.new('L', (logo_size, logo_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, logo_size, logo_size), radius=24, fill=255)
    
    logo_x = 24
    logo_y = (height - logo_size) // 2
    im.paste(logo_thumb, (logo_x, logo_y), mask)

    # Fonts
    bold_font_path = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
    reg_font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'

    title_font = ImageFont.truetype(bold_font_path, 22)
    sub_font = ImageFont.truetype(reg_font_path, 13)
    badge_font = ImageFont.truetype(bold_font_path, 11)

    # Text column on right
    text_x = 182
    draw.text((text_x, 62), "Smart PII", fill=(255, 255, 255), font=title_font)
    draw.text((text_x, 90), "Sanitizer", fill=(56, 189, 248), font=title_font) # Sky blue
    
    draw.text((text_x, 126), "Two-Way AI Privacy & Redaction", fill=(203, 213, 225), font=sub_font)
    draw.text((text_x, 146), "Restores real values in 1 click", fill=(148, 163, 184), font=sub_font)

    # Badge Pill: 100% Local · Zero Telemetry
    pill_y = 182
    pill_w = 230
    pill_h = 28
    draw.rounded_rectangle((text_x, pill_y, text_x + pill_w, pill_y + pill_h), radius=14, 
                           fill=(15, 23, 42, 220), outline=(16, 185, 129, 160), width=1)
    
    # Emerald dot inside pill
    draw.ellipse((text_x + 12, pill_y + 10, text_x + 20, pill_y + 18), fill=(16, 185, 129, 255))
    draw.text((text_x + 28, pill_y + 7), "100% Local · Zero Network", fill=(16, 185, 129), font=badge_font)

    im.convert('RGB').save(out_path, 'PNG')
    print("Created small promo tile:", out_path, im.size)

def create_large_tile(logo_img, out_path):
    width, height = 920, 680
    im = Image.new('RGBA', (width, height), (11, 15, 25, 255)) # #0b0f19
    
    # Ambient multi-color glows
    glow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-80, -40, 480, 500), fill=(37, 99, 235, 60)) # blue
    glow_draw.ellipse((450, 200, 960, 720), fill=(16, 185, 129, 40)) # emerald
    glow_draw.ellipse((600, -80, 1000, 320), fill=(147, 51, 234, 30)) # purple accent
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    im = Image.alpha_composite(im, glow)
    draw = ImageDraw.Draw(im)

    # Subtle outer rounded border
    draw.rounded_rectangle((3, 3, width - 4, height - 4), radius=16, outline=(59, 130, 246, 60), width=1)

    bold_font_path = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
    reg_font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'

    title_font = ImageFont.truetype(bold_font_path, 40)
    sub_title_font = ImageFont.truetype(reg_font_path, 18)
    code_font = ImageFont.truetype(bold_font_path, 13)
    badge_font = ImageFont.truetype(bold_font_path, 14)
    item_font = ImageFont.truetype(reg_font_path, 14)

    # Left Section: Logo & Branding
    logo_size = 190
    logo_thumb = logo_img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (logo_size, logo_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, logo_size, logo_size), radius=34, fill=255)
    
    im.paste(logo_thumb, (54, 60), mask)

    draw.text((270, 72), "Smart PII Sanitizer", fill=(255, 255, 255), font=title_font)
    draw.text((270, 128), "Two-Way Reversible AI Privacy for ChatGPT, Claude & Copilot", fill=(56, 189, 248), font=sub_title_font)
    draw.text((270, 160), "Scrub logs, code & credentials locally — restore real values in 1 click.", fill=(148, 163, 184), font=item_font)

    # Divider line
    draw.line((54, 280, width - 54, 280), fill=(51, 65, 85, 180), width=1)

    # Left Column: Key Pillars
    left_x = 54
    y = 315

    pillars = [
        ("🔒 100% Client-Side Engine", "Zero network requests, zero telemetry. Never leaves your browser memory."),
        ("🔄 Reversible Token Replacement", "Swap real values back into AI code, SQL & logs byte-for-byte."),
        ("🧩 Structure & Format Preserving", "JSON remains valid JSON; code indentation and syntax never break."),
        ("⚡ High Performance & Speed", "Sanitizes 10,000+ lines in <200ms with real-time severity flagging.")
    ]

    for title, desc in pillars:
        draw.text((left_x, y), title, fill=(241, 245, 249), font=badge_font)
        draw.text((left_x, y + 24), desc, fill=(148, 163, 184), font=item_font)
        y += 72

    # Right Column: Visual Before / After Card
    card_x = 490
    card_y = 305
    card_w = 376
    card_h = 295

    # Card background (dark editor window)
    draw.rounded_rectangle((card_x, card_y, card_x + card_w, card_y + card_h), radius=12,
                           fill=(15, 23, 42, 230), outline=(59, 130, 246, 120), width=1)

    # Window header bar
    draw.rounded_rectangle((card_x, card_y, card_x + card_w, card_y + 34), radius=12, fill=(30, 41, 59, 255))
    draw.rectangle((card_x, card_y + 20, card_x + card_w, card_y + 34), fill=(30, 41, 59, 255)) # straighten bottom
    
    # Window traffic lights
    draw.ellipse((card_x + 14, card_y + 12, card_x + 24, card_y + 22), fill=(239, 68, 68))
    draw.ellipse((card_x + 30, card_y + 12, card_x + 40, card_y + 22), fill=(245, 158, 11))
    draw.ellipse((card_x + 46, card_y + 12, card_x + 56, card_y + 22), fill=(16, 185, 129))
    draw.text((card_x + 70, card_y + 10), "smart-pii-sanitizer :: terminal", fill=(148, 163, 184), font=ImageFont.truetype(reg_font_path, 11))

    # Editor content
    cy = card_y + 46
    draw.text((card_x + 18, cy), "// 1. Raw Sensitive Input:", fill=(148, 163, 184), font=code_font)
    cy += 20
    draw.text((card_x + 18, cy), 'password = "SuperSecretPass!123"', fill=(248, 113, 113), font=code_font)
    cy += 18
    draw.text((card_x + 18, cy), 'source_ip = "192.168.1.1"', fill=(248, 113, 113), font=code_font)
    cy += 18
    draw.text((card_x + 18, cy), 'aadhaar   = "5832 9661 7644"', fill=(248, 113, 113), font=code_font)

    cy += 28
    draw.text((card_x + 18, cy), "// 2. Sanitized for AI Chatbot:", fill=(148, 163, 184), font=code_font)
    cy += 20
    draw.text((card_x + 18, cy), 'password = "REDACTED_KEY_1"', fill=(56, 189, 248), font=code_font)
    cy += 18
    draw.text((card_x + 18, cy), 'source_ip = "10.0.0.1"', fill=(56, 189, 248), font=code_font)
    cy += 18
    draw.text((card_x + 18, cy), 'aadhaar   = "REDACTED_AADHAAR_1"', fill=(56, 189, 248), font=code_font)

    # Bottom reverse pill inside card
    cy += 30
    draw.rounded_rectangle((card_x + 18, cy, card_x + card_w - 18, cy + 32), radius=8,
                           fill=(16, 185, 129, 30), outline=(16, 185, 129, 200), width=1)
    draw.text((card_x + 36, cy + 8), "✨ Reverse Map: 100% Restored from AI reply", fill=(52, 211, 153), font=code_font)

    # Bottom footer ribbon
    draw.text((width // 2 - 140, height - 36), "100% Free & Open Source · Zero Telemetry", fill=(100, 116, 139), font=item_font)

    im.convert('RGB').save(out_path, 'PNG')
    print("Created large promo tile:", out_path, im.size)

def main():
    logo_path = 'smart-pii-sanitizer/store-assets/logo-master.jpg'
    logo_img = Image.open(logo_path)
    
    dest_dir = 'smart-pii-sanitizer/store-assets'
    small_path = os.path.join(dest_dir, 'promo-small-440x280.png')
    large_path = os.path.join(dest_dir, 'promo-large-920x680.png')

    create_small_tile(logo_img, small_path)
    create_large_tile(logo_img, large_path)

if __name__ == '__main__':
    main()
