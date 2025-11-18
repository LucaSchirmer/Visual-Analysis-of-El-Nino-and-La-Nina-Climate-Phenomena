from livereload import Server, shell

# Serve current directory
server = Server()
server.watch('*.html')  # Watch HTML changes
server.watch('*.css')   # Watch CSS changes
server.watch('*.js')    # Watch JS changes
server.serve(root='.', port=8000)
