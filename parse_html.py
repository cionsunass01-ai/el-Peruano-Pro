from bs4 import BeautifulSoup

with open("/downloads/test_page2.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, 'html.parser')

print("=== INPUTS ===")
for inp in soup.find_all('input'):
    print(f"ID: {inp.get('id')} Type: {inp.get('type')} Class: {inp.get('class')} Data-Tipo: {inp.get('data-tipo')} Value: {inp.get('value')}")

print("\n=== BUTTONS ===")
for btn in soup.find_all('button'):
    print(f"ID: {btn.get('id')} Text: {btn.text.strip()}")

print("\n=== PDF LINKS ===")
for a in soup.find_all('a', href=True):
    if '.pdf' in a['href'].lower() or 'cuadernillo' in a.text.lower() or 'descargar' in a.text.lower():
        print(f"Text: {a.text.strip()} Href: {a['href']}")

print("\n=== IMGS inside A ===")
for a in soup.find_all('a', href=True):
    img = a.find('img')
    if img and ('cuadernillo' in img.get('src', '').lower() or 'cuadernillo' in img.get('alt', '').lower()):
        print(f"Img alt: {img.get('alt')} Href: {a['href']}")
