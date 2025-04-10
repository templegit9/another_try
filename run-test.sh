#!/bin/bash

# Open the test HTML file in the default browser
echo "Opening test-collapsible.html in the default browser..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open test-collapsible.html
elif [[ "$OSTYPE" == "darwin"* ]]; then
    open test-collapsible.html
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    start test-collapsible.html
else
    echo "Could not determine how to open the file on your operating system."
    echo "Please open test-collapsible.html manually in your browser."
fi

echo "Test completed. Check the results in the browser." 