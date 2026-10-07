FROM php:8.2-apache

# Enable Apache mod_rewrite for API routing
RUN a2enmod rewrite

# Install MySQL extension
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Copy backend files into Apache web root
COPY . /var/www/html/

# Set working directory
WORKDIR /var/www/html

EXPOSE 80