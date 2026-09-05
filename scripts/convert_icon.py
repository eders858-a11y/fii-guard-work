from pathlib import Path
from PIL import Image

source = Path('/home/ubuntu/upload/5493054.webp')
project = Path('/home/ubuntu/carteira-fiis/assets/images')
image = Image.open(source).convert('RGBA')
image = image.resize((512, 512), Image.Resampling.LANCZOS)
for filename in ('icon.png', 'splash-icon.png', 'favicon.png', 'android-icon-foreground.png'):
    image.save(project / filename, format='PNG', optimize=True)
print('Ícones convertidos para PNG:', image.size)
