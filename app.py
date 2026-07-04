import os
import re
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache for parsed release notes
cache = {
    "data": None,
}

def html_to_text(html):
    """Converts HTML content to clean plain text, formatting list items nicely."""
    soup = BeautifulSoup(html, 'html.parser')
    
    # Format code tags slightly (e.g., `code`)
    for code in soup.find_all('code'):
        code.replace_with(f"`{code.text}`")
        
    # Replace list items with bullet points
    for li in soup.find_all('li'):
        li.insert_before('• ')
        li.insert_after('\n')
        
    # Add spacing after paragraphs
    for p in soup.find_all('p'):
        p.insert_after('\n\n')
        
    text = soup.get_text()
    
    # Remove extra whitespace
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def fetch_and_parse_notes():
    """Fetches the XML feed and parses it into discrete, tweetable updates."""
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching feed: {e}")
        # If fetch fails but we have cached data, return that
        if cache["data"]:
            return cache["data"], True
        raise e

    soup = BeautifulSoup(response.content, 'xml')
    entries = []
    
    # We want to iterate through all entries in the feed
    for entry in soup.find_all('entry'):
        date_str = entry.title.text.strip() if entry.title else "Unknown Date"
        updated_str = entry.updated.text.strip() if entry.updated else ""
        link_elem = entry.find('link', rel='alternate')
        link = link_elem['href'] if link_elem else ""
        entry_id = entry.id.text.strip() if entry.id else link

        content_elem = entry.content
        if not content_elem:
            continue
            
        content_html = content_elem.text
        content_soup = BeautifulSoup(content_html, 'html.parser')
        
        # Check if there are h3 headers dividing the entry
        h3s = content_soup.find_all('h3')
        
        if not h3s:
            # Whole entry content is a single update
            clean_text = html_to_text(content_html)
            entries.append({
                'id': entry_id,
                'date': date_str,
                'updated': updated_str,
                'link': link,
                'type': 'Update',
                'description_html': content_html,
                'text_content': clean_text,
                'text_snippet': clean_text[:200] + '...' if len(clean_text) > 200 else clean_text
            })
        else:
            # Entry contains multiple updates under h3 subheadings
            for i, h3 in enumerate(h3s):
                update_type = h3.text.strip()
                
                # Collect sibling elements until the next h3
                desc_parts = []
                sibling = h3.next_sibling
                while sibling and sibling.name != 'h3':
                    desc_parts.append(str(sibling))
                    sibling = sibling.next_sibling
                
                description_html = "".join(desc_parts).strip()
                clean_text = html_to_text(description_html)
                
                # Check for list headers or prefix text to clean
                if not clean_text:
                    continue
                
                # Specific URL hash for this update heading if possible
                safe_type_id = re.sub(r'[^a-zA-Z0-9]', '_', update_type.lower())
                specific_link = f"{link}#{safe_type_id}"
                
                # Make a unique ID for this update
                specific_id = f"{entry_id}#item-{i}"
                
                entries.append({
                    'id': specific_id,
                    'date': date_str,
                    'updated': updated_str,
                    'link': specific_link,
                    'type': update_type,
                    'description_html': description_html,
                    'text_content': clean_text,
                    'text_snippet': clean_text[:200] + '...' if len(clean_text) > 200 else clean_text
                })
                
    cache["data"] = entries
    return entries, False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    try:
        entries, is_cached = fetch_and_parse_notes()
        return jsonify({
            "status": "success",
            "is_cached": is_cached,
            "count": len(entries),
            "data": entries
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
