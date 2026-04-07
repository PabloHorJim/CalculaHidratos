import json
import re
import requests
import fitz  # PyMuPDF
from bs4 import BeautifulSoup
import io

html_content = """
<div class="col-xl-8 col-lg-8 col-md-8 col-sm-12">
					<!--=============Left Side Bar==============-->

					<div class="left-side">
						<div class="blog-post-heading">
							<h1></h1>
						</div>
						<!--single blog content-->

						<div class="blog-body-content">
						  
							
                         <div class="row">
			
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/001.jpg" alt="">
							<div class="portfolio-content">
								<h4>Cereales y Derivados</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/001/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/001-Cereales-Derivados.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Cereales y Derivados</h4>
					</div>
			</div>
			
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/002.jpg" alt="">
							<div class="portfolio-content">
								<h4>Leche y Productos Lácteos</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/002/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/002-Leche-Productos-Lacteos.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Leche y Productos Lácteos</h4>
					</div>
			</div>
			
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/003.jpg" alt="">
							<div class="portfolio-content">
								<h4>Huevos</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/003/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/003-Huevos.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Huevos</h4>
					</div>
			</div>
			
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/004.jpg" alt="">
							<div class="portfolio-content">
								<h4>Azúcares y Dulces</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/004/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/004-Azucares-Dulces.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Azúcares y Dulces</h4>
					</div>
			</div>
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/005.jpg" alt="">
							<div class="portfolio-content">
								<h4>Aceites y Grasas</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/005/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/005-Aceites-Grasas.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Aceites y Grasas</h4>
					</div>
			</div>
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/006.jpg" alt="">
							<div class="portfolio-content">
								<h4>Verduras y Hortalizas</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/006/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/006-Verduras-Hortalizas.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Verduras y Hortalizas</h4>
					</div>
			</div>
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/007.jpg" alt="">
							<div class="portfolio-content">
								<h4>Legumbres</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/007/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/007-Legumbres.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Legumbres</h4>
					</div>
			</div>
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/008.jpg" alt="">
							<div class="portfolio-content">
								<h4>Frutas</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/008/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/008-Frutas.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Frutas</h4>
					</div>
			</div>
							 
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/009.jpg" alt="">
							<div class="portfolio-content">
								<h4>Frutos Secos</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/009/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/009-Frutos-Secos.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Frutos Secos</h4>
					</div>
			</div>
							 
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/010.jpg" alt="">
							<div class="portfolio-content">
								<h4>Carnes y Productos carnicos</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/010/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/010-Carnes.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Carnes y Productos carnicos</h4>
					</div>
			</div>
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/011.jpg" alt="">
							<div class="portfolio-content">
								<h4>Pescados</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/011/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/011-Pescados.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Pescados</h4>
					</div>
			</div>	
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/012.jpg" alt="">
							<div class="portfolio-content">
								<h4>Crustáceos y Moluscos</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/012/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/012-Crustaceos.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Crustáceos y Moluscos</h4>
					</div>
			</div>
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/013.jpg" alt="">
							<div class="portfolio-content">
								<h4>Condimentos y Aperitivos</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/013/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/013-Condimentos.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Condimentos y Aperitivos</h4>
					</div>
			</div>	
			<div class="col-xl-4 col-lg-4 col-md-4 col-sm-6 default-margin-mt portfolio-headmove">
					<div class="single-portfolio">
						<div class="portfolio-image">
							<img src="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/014.jpg" alt="">
							<div class="portfolio-content">
								<h4>Bebidas</h4>
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/014/index.html" target="_blank">Ver Flipbook</a>
								|
								<a href="https://www.fen.org.es/storage/app/media/flipbook/mercado-alimentos-fen/014-Bebidas.pdf" target="_blank">Ver PDF</a>
							</div>
						</div>
					</div>
					<div class="portfolio-titile">
						<h4>Bebidas</h4>
					</div>
			</div>
			
"""

def extract_links(html):
    """Parses HTML to find the category name and its corresponding PDF URL."""
    soup = BeautifulSoup(html, 'html.parser')
    items = []
    
    portfolio_contents = soup.find_all('div', class_='portfolio-content')
    for content in portfolio_contents:
        name_tag = content.find('h4')
        if not name_tag:
            continue
        name = name_tag.text.strip()
        
        pdf_link_tag = content.find('a', href=lambda href: href and href.endswith('.pdf'))
        if pdf_link_tag:
            items.append({
                "category": name,
                "url": pdf_link_tag['href']
            })
    return items

def process_pdf_catalog(pdf_url, category_name):
    """Downloads the PDF and processes it page by page to extract multiple foods."""
    results = []
    try:
        response = requests.get(pdf_url, timeout=15)
        response.raise_for_status()
        
        pdf_stream = io.BytesIO(response.content)
        doc = fitz.open(stream=pdf_stream, filetype="pdf")
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            
            # Skip pages that do not contain the nutritional table
            if "Hidratos de carbono" not in text:
                continue
            
            # Extract Food Name: Allow commas, hyphens, slashes, and newlines
            food_name_match = re.search(r"\(([A-ZÁÉÍÓÚÑ\s,\-/\n\r]+)\)", text)
            
            if food_name_match:
                # Replace newlines/multiple spaces with a single space and strip edges
                food_name = re.sub(r'\s+', ' ', food_name_match.group(1)).strip()
            else:
                food_name = f"Unknown (Page {page_num + 1})"
            # Extract Carbs: Grabs the number associated with Hidratos de carbono, 
            # specifically skipping values clearly labeled as energy (kJ/kcal)
            # FEN tables typically list Energía (kJ), Energía (kcal), Proteínas, then Hidratos de carbono.
            carb_match = re.search(r"Hidratos de carbono\s*([\d]+(?:[,.]\d+)?)", text, re.IGNORECASE)
            # If not found adjacent, try searching more broadly but avoid the kJ/kcal lines
            if not carb_match:
                # Look for 'Hidratos de carbono' then find the first number that isn't clearly ENERGY
                parts = re.split(r"Hidratos de carbono", text, flags=re.IGNORECASE)
                if len(parts) > 1:
                    # Look in the text immediately AFTER 'Hidratos de carbono'
                    subtext = parts[1][:100]
                    # First number that isn't energy
                    num_matches = re.findall(r"([\d]+(?:[,.]\d+)?)", subtext)
                    if num_matches:
                        for val in num_matches:
                           # Skip common energy values if they appear near by (loose check)
                           fval = float(val.replace(',', '.'))
                           if fval < 100: # Carbs per 100g cannot be > 100
                               carbs_str = val.replace(',', '.')
                               break
                        else:
                            carbs_str = num_matches[0].replace(',', '.')
                    else:
                        carb_match = None
                else:
                    carb_match = None
            else:
                carbs_str = carb_match.group(1).replace(',', '.')
            
            if carbs_str:
                results.append({
                    "category": category_name,
                    "food": food_name,
                    "hc_g_100g": float(carbs_str),
                    "source_url": f"{pdf_url}#page={page_num + 1}"
                })
                
    except Exception as e:
        print(f"Error processing {pdf_url}: {e}")
        
    return results

def main():
    print("Parsing HTML...")
    catalogs = extract_links(html_content)
    all_foods_data = []
    
    print(f"Found {len(catalogs)} PDF catalogs. Beginning extraction...")
    for catalog in catalogs:
        print(f"Processing catalog: {catalog['category']}...")
        catalog_results = process_pdf_catalog(catalog['url'], catalog['category'])
        all_foods_data.extend(catalog_results)
        
    print(f"\nExtraction complete. Total foods processed: {len(all_foods_data)}")
    
    # Export to JSON
    with open('nutricional_data.json', 'w', encoding='utf-8') as f:
        json.dump(all_foods_data, f, indent=4, ensure_ascii=False)
    
    print("Data saved to nutricional_data.json")

if __name__ == "__main__":
    main()
